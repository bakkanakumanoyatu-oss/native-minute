# Native Minute Phase B0 認証テスト成果物の安全調査

- 実施日: 2026-07-16
- 総合判定: **POTENTIAL_EXPOSURE**
- 即時ローテーション: **不要（現時点の証拠に基づく）**
- P0 / P1 / P2: **0 / 4 / 5**
- 調査停止点: 分類文書の作成まで。削除、失効、ローテーション、コード・設定変更、commit、pushは未実施。

## 1. Executive summary

今回の調査では、実際の秘密値または再利用可能な認証情報がtracked file、到達可能なGit履歴、現在の未追跡・ignored成果物に保存されている証拠は見つからなかった。したがって `CONFIRMED_EXPOSURE` は0件であり、この結果だけを根拠にservice role key、provider API key、password、session、refresh tokenを直ちに失効・ローテーションする必要はない。

一方で、以下の理由から総合判定を `NO_EXPOSURE` にはせず、`POTENTIAL_EXPOSURE` とする。

1. `test-results 2/` 配下にPlaywright成果物12件がtrackedされ、うち4件はauth setup失敗時のtrace、画像、動画、error contextである。
2. `.gitignore` は `test-results` を除外するが、派生名 `test-results 2` を捕捉しない。
3. Playwright設定は失敗時にtrace、screenshot、videoを保持する。
4. auth failure logがraw error metadata、redirect URL、query/hashを保持し得るnext path、cookie名を扱う。
5. Playwright failure assertionがresponse payload全体を文字列化し得る。

現在trackedされているauth traceは、値非表示の構造化scanで17件のnetwork記録と689個のJSON objectを確認した。auth test requestは失敗しており、session cookie、refresh token、access token、callback code、PKCE verifier、API key、service role key、非placeholder passwordは検出されなかった。trace内で確認できた認証用fieldは、tracked sourceにも明示されている既知のE2E placeholderだけだった。これは `NO_EXPOSURE` と分類する。ただし、traceという形式自体はrequest/response、DOM snapshot、screenshotを保持し得るため、将来の再発防止とcleanupは必要である。

## 2. Scope

対象は隔離worktree `/Users/karasawatakahiro/.codex/worktrees/b4db/native-minute` と、そのGit object databaseで到達可能な全refである。

調査範囲:

- 現在のtracked files 434件
- `git rev-list --all` で到達可能な125 commits
- 履歴中のunique text blob 927件
- tracked、untracked、ignoredのPlaywright report、test result、trace、zip、screenshot、video、log、swap、debug、Xcode / Simulator候補
- auth / login / callback / middleware / test-login実装
- Playwright設定、storage state、E2E credential参照
- logging、error propagation、safe summary、redaction方針
- `.env*`、秘密鍵、Apple signing containerのpath-only inventory

対象外:

- `.env.local`、秘密鍵、証明書、provisioning profileの内容
- secret、token、cookie、password、magic link、auth codeの外部有効性確認
- provider API、Supabase API、production URLへの送信・照会
- Git reflogの到達不能object、開発者端末全体、CI provider側artifact storage、外部dashboard上のlog
- 削除、隔離移動、失効、ローテーション、history rewrite、repo設定変更

## 3. Worktree / repository identity

| Check | Result |
| --- | --- |
| `pwd` | `/Users/karasawatakahiro/.codex/worktrees/b4db/native-minute` |
| Git top-level | 上記と一致 |
| Branch | detached HEAD |
| HEAD | `21bb4b8` |
| 開始時status | 既存の未追跡 `docs/ultra-release-audit.md` 1件のみ |
| Worktree registration | `git worktree list` でDeveloper checkoutとは別の有効なworktreeとして確認 |
| Original auth checkout | `/Users/karasawatakahiro/Developer/native-minute`。変更・調査対象外 |
| Desktop checkout | 変更・調査対象外 |

`npm run check:workspace` は、この隔離worktreeのsnapshotにscript自体が存在しないため `Missing script` で終了した。workspace guardは変更せず、`pwd`、Git top-level、detached HEAD、`git worktree list` の一致を隔離性の根拠とした。

## 4. Safety constraints

- 一致した値、source line本文、秘密を含み得るURL全文、hashを報告・保存しない。
- `.env.local` と秘密鍵containerは開かない。
- text scanはpath、category、count、placeholder判定だけを出力する。
- traceはrepo内へ展開せず、構造化JSONをmemoryで検査した。
- OCR / media変換が必要な場合だけ `/tmp` を使用し、派生fileを直ちに削除した。
- active判定のために外部serviceへ値を送信しない。
- `CONFIRMED_EXPOSURE` を検出した場合は、そのcategory以外の深掘りを停止する設計とした。今回は該当なし。
- read-only subagent 1件をauth logging / artifact exposureの独立確認だけに使用し、repo編集なしを確認した。

## 5. Inspection methods

### Path-only inventory

`git ls-files`、`git status --short`、`git check-ignore`、filesystem metadataを使い、secret container、artifact拡張子、artifact directory、Xcode / Simulator成果物をpathと件数だけで分類した。

### Current tracked text scan

tracked textに対し、次のcategoryを値非表示で検査した。

- magic link / Supabase verify URL
- callback code / token hash
- access / refresh / session token
- cookie / PKCE verifier
- API key / Supabase service role key
- password / E2E auth secret
- signed URL
- email address
- credential環境変数の参照

heuristic候補は、source expression、placeholder、boolean、status labelとの区別を追加の構造reviewで確認した。

### Git history scan

全125 commitsのtreeを列挙し、secret containerはpathだけ、text blobは内容を標準出力へ出さずcategory scanした。artifact pathについてはtree presence commit数、unique blob数、path変更commit数だけを集計した。

### Trace / media scan

- trace archive: 17 entries、text 11、binary 6を確認
- network: 17 recordsをmethod、path、status、sensitive header名、body keyだけで確認
- JSON: 689 objectsをrecursiveに検査
- screenshot: 12 PNGをcategory-only OCR
- auth video: first-frame変換を `/tmp` で試行
- trace内画像: 4件を `/tmp` で変換しcategory-only OCRを試行
- swap: printable stringsをcategory scan

OCRは秘密値の不存在を完全に証明できないため、読取不能・空frameの残余riskを `POTENTIAL_EXPOSURE` に残した。

### Official behavior references

- [Playwright authentication](https://playwright.dev/docs/auth): authenticated storage stateにはimpersonation可能なcookie / headerが含まれ得るため、repoへcommitしないよう警告している。
- [Playwright tracing](https://playwright.dev/docs/api/class-tracing): traceはbrowser operation、network activity、DOM snapshot、screenshotを記録し得る。
- [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection): supported secret patternのpush前blockに利用できる。ただし検出範囲には限界があるため、artifact path gateと併用する。

## 6. Classification summary

件数の単位はraw matchではなく、次節のfinding rowである。

| Classification | Count |
| --- | ---: |
| `NO_EXPOSURE` | 4 |
| `POTENTIAL_EXPOSURE` | 5 |
| `CONFIRMED_EXPOSURE` | 0 |

| Severity | Count | Meaning in this audit |
| --- | ---: | --- |
| P0 | 0 | active / reusableな長期credentialを示す証拠なし |
| P1 | 4 | auth値を将来保存し得るlogging / artifact経路 |
| P2 | 5 | placeholder、低感度artifact、読取限界、hygiene課題 |

## 7. Findings table

| ID | Category | Classification | Severity | Path | Scope | Time | Evidence type | Recommended action | Rotation required |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-LOG-01 | full redirect / next-path logging | POTENTIAL_EXPOSURE | P1 | `app/api/auth/sign-in/route.ts`, `lib/navigation.ts` | tracked / history | current / historical | code review | failure kindとbooleanだけにし、origin、redirect URL、query/hash付きnextPathを記録しない | conditional |
| AUTH-LOG-02 | raw callback error metadata | POTENTIAL_EXPOSURE | P1 | `app/auth/callback/route.ts` | tracked / history | current / historical | code review | provider error/message、query/hash付きnextPath、cookie名列挙をfixed reason code、boolean、route categoryへ縮退する | conditional |
| AUTH-TEST-01 | raw provider error / Playwright failure payload | POTENTIAL_EXPOSURE | P1 | `services/test-auth/test-login.service.ts`, `app/api/test-login/route.ts`, `app/api/auth/sign-out/route.ts`, `tests/e2e/request-helpers.ts`, `tests/e2e/auth.setup.ts` | tracked / history | current / historical | code review | provider error本文をclientへ返さず、assertionでresponse payload全体を文字列化しない | conditional |
| AUTH-PW-01 | retained auth artifacts / ignore bypass | POTENTIAL_EXPOSURE | P1 | `playwright.config.ts`, `.gitignore`, `test-results 2/auth.setup.ts-create-authenticated-storage-state-setup/` | tracked / history | current / historical | config、Git metadata、trace structure | auth setupのtrace/screenshot/videoを無効化または明示opt-inにし、派生directory名をCIで拒否する。tracked artifactは別Phaseでcleanup | conditional |
| AUTH-PW-02 | screenshot / video residual uncertainty | POTENTIAL_EXPOSURE | P2 | auth setupのPNG、WebM、trace内画像、他のtracked smoke screenshot | tracked / history | current / historical | category-only OCR / media metadata | privacy cleanup candidateとする。必要な画像はdummy dataで再作成し、保管期限を定める | conditional |
| AUTH-TRACE-01 | current trace credential content | NO_EXPOSURE | P2 | `test-results 2/auth.setup.ts-create-authenticated-storage-state-setup/trace.zip` | tracked / history | current / historical | structured trace scan | 現物だけを根拠とするrotationは不要。形式自体はcleanup candidate | no |
| AUTH-CODE-01 | callback / middleware secret-value logging | NO_EXPOSURE | P2 | `app/auth/callback/route.ts`, `middleware.ts`, tracked safe-summary outputs | tracked / history | current / historical | code / structured text scan | code、tokenHash、cookie valueを記録しない現在の原則を維持する | no |
| AUTH-STATE-01 | Playwright storage state | NO_EXPOSURE | P2 | `tests/e2e/.auth/user.json` | ignored candidate | current | existence / ignore check | current absent、tracked absentを維持し、CIでもtracked pathを拒否する | no |
| AUTH-SWAP-01 | editor swap artifact | NO_EXPOSURE | P2 | `.middleware.ts.swp` | tracked / history | current / historical | binary strings category scan | 別Phaseでcurrent treeから除外し、swap globをignoreする | no |

## 8. Tracked files result

- tracked files: 434
- high-confidence concrete credential match: 0
- tracked secret-container filename: `.env.example` 1件
- tracked `.env.local`: 0
- tracked private key / certificate / provisioning profile / Apple signing secret container: 0
- tracked Playwright / test-result artifact under `test-results 2/`: 12
- auth setup artifact: 4
- tracked editor swap: 1
- tracked smoke screenshot outside `test-results 2/`: 3

`.env.example` は現在版だけをmetadata-onlyで確認した。29 assignmentsのうち、service role、Supabase anon key、OpenAI、Azure、ElevenLabs、E2E email/password/secretのsensitive fieldsは空である。model名、provider選択、公開app URLなどの非秘密設定はcredentialとして数えていない。`NEXT_PUBLIC_SUPABASE_ANON_KEY` は公開client用識別子であり、service role keyと混同していない。

`tests/e2e/e2e-env.ts` のdefault email、password、test secretは固定literalだが、すべてE2E/test markerを持つplaceholderで、高entropy credential形状ではない。現在のtraceでも同じknown placeholderだけが確認された。実在demo / reviewer passwordはtracked outputに存在せず、booleanまたは`human_required`等のstatus markerだけだった。

Apple関連ではXcode projectに通常のcode-sign setting参照はあるが、private key、certificate、provisioning profile、app-specific password、issuer credentialのtracked containerはない。

## 9. Git history result

- reachable commits across all refs: 125
- scanned unique text blobs: 927
- history上のsecret-container filename: `.env.example` のみ
- history上の`.env.local`、private key、certificate、provisioning profile: 0
- text historyのhigh-confidence concrete credential: 0

auth setupのerror context、PNG、trace、WebMと`.middleware.ts.swp`は、それぞれunique blob 1件、path変更commit 1件で、scan時点の全125 reachable commit treeに存在した。したがって、現在blobへの安全scan結果は到達可能な履歴内の同pathにも適用できる。一方、artifact自体が履歴全体に残っていることはhygiene / privacy cleanup上の課題である。

現在の証拠ではhistory rewriteは不要である。必要条件は第17節に限定する。

## 10. Untracked / ignored artifacts result

- untracked files: 開始時から存在した `docs/ultra-release-audit.md` 1件のみ
- targeted untracked / ignored Playwright、trace、screenshot、video、zip、log、dump: 0
- `tests/e2e/.auth/user.json`: current absent、tracked absent、directory ignored
- `.env.local`: current absent
- Xcode DerivedData、xcuserdata、xcresult、Simulator log / screenshot候補: 0

既存の `docs/ultra-release-audit.md` は今回変更していない。今回の文書を除き、新しいrepo artifactは作成していない。

## 11. Playwright / screenshot / trace result

`playwright.config.ts` は次を設定している。

- trace: failure時保持
- screenshot: failure時のみ
- video: failure時保持
- authenticated storage state: `tests/e2e/.auth/user.json`

storage state directoryは`.gitignore`済みだが、`test-results 2` は`test-results` ruleを回避してtrackedされている。

current auth traceの安全scan結果:

| Check | Result |
| --- | --- |
| archive entries | 17 |
| text / binary entries | 11 / 6 |
| parsed JSON objects | 689 |
| network records | 17 |
| auth test response | 500。authenticated session成立なし |
| sensitive request header names | 0 |
| concrete token / cookie / password / PKCE / auth code / API key | 0 |
| known E2E placeholder | present |
| full email | scan上の出現はあったが、email単独は秘密漏えいに分類しない |

12 PNGのcategory-only OCRではsecret category 0だった。auth video first frameとtrace内4画像は変換できたが、OCRが有効なtextを返さないものがあり、完全性を保証できない。この残余不確実性を `AUTH-PW-02` として残す。

## 12. Auth logging and redaction review

### 安全側の確認

- callbackはrequestからcode / tokenHashを読むが、その値自体を明示logしていない。
- cookieはnameの一部をlog対象にするが、valueはlogしていない。
- middlewareに明示的console logはない。
- tracked safe-summary outputはcount、boolean、status、reason label中心である。
- current traceにsession成立、sensitive header、concrete tokenの証拠はない。

### Potential exposure経路

1. sign-in failure logはorigin、public app URL、redirect URL、nextPathを記録する。
2. `getOptionalInternalPath` はallowed pathnameを確認するが、queryとhashを保持するため、秘密queryが混入したnextPathを完全には除去しない。
3. callback failure logはprovider error、raw error message、origin、nextPath、cookie name listを扱う。error object本文が常に秘密非包含である保証はない。
4. test-login serviceはprovider error messageを`AppError`へ連結し、routeはmessageをclientへ返す。
5. sign-out error responseもprovider error messageをdetailとして返す。
6. Playwright helperはfailure時にresponse payload全体をassertion messageへ入れ得る。
7. framework / hosting側request logがfull request URLを記録する可能性はrepoだけでは否定できない。

現在repo内にraw runtime log fileは見つからなかった。したがって上記は「保存済み秘密の確認」ではなく「保存し得る経路」の `POTENTIAL_EXPOSURE` である。

## 13. Expected local secret containers

| Container | Current state | Classification |
| --- | --- | --- |
| `.env.local` | absent。内容未読 | NO_EXPOSURE |
| `.env.example` | tracked。sensitive fieldsは空 | NO_EXPOSURE |
| `tests/e2e/.auth/user.json` | absent、ignored、untracked | NO_EXPOSURE |
| Apple private key / certificate / provisioning profile | tracked pathなし | NO_EXPOSURE |
| provider credentials | environment variable参照のみ。tracked concrete valueなし | NO_EXPOSURE |
| reviewer / demo credentials | status placeholderのみ。actual credentialなし | NO_EXPOSURE |

将来`.env.local`がuntrackedで存在するだけなら、それ自体はexposureではない。ただし内容をartifact、log、trace、support messageへ複製しないことが条件である。

## 14. Immediate containment recommendations

今回のPhaseでは実行しない。推奨だけを記録する。

1. 現在のauth trace、PNG、WebM、error contextを追加共有・再利用しない。
2. Phase B1完了までauth test artifactを新規commitしない。
3. 現在の証拠だけではcredential rotationを開始しない。
4. repo外のCI artifact storage、hosting logs、共有chatに同じtraceが転載されていないかはhuman ownerがpath / existenceだけを確認する。
5. actual E2E override credentialを過去に使用したという別証拠が出た場合は、本書のplaceholder判定に依存せずP0/P1として再triageする。

## 15. Rotation decision matrix

| Finding if later confirmed | Severity | Required action | History action |
| --- | --- | --- | --- |
| service role key、provider API key、Apple private credential、reusable password | P0 | 即時rotation、利用先inventory、access log review | secretを含むblobをrewrite対象にする |
| refresh token、session cookie、reusable authenticated storage state | P0 | 全関連session revoke、test account password rotation | blob / artifactをrewrite対象にする |
| access token、magic link、callback code、PKCE verifier | P1 | expiry確認だけに依存せず、関連session revokeを検討。test credentialはconditional rotation | current / historyの保存範囲で判断 |
| signed URL with remaining validity | P1 | object accessを無効化またはobject key変更を検討 | URL保存blobをrewrite候補にする |
| full email only | P2 | 秘密rotation不要。privacy目的の削除だけ検討 | 法務・privacy要件次第 |
| known placeholder / empty field / boolean / count | P2 | rotation不要 | rewrite不要 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`だけ | P2 | 原則rotation不要。service roleとの混同や誤権限がある場合だけ再評価 | 原則rewrite不要 |
| unreadable screenshot / videoだけ | P2 | 共有停止、local cleanup候補。具体credential確認時だけ上位へ再分類 | conditional |

## 16. Cleanup candidates

別Phaseでowner承認後に扱う候補:

1. `test-results 2/` のtracked 12 files
2. auth setup subsetのerror context、PNG、trace、WebM 4 files
3. `.middleware.ts.swp`
4. `artifacts/rr-2b-settings-smoke.png`
5. `artifacts/rr-2g/settings-db-dry-run.png`
6. `artifacts/rr-2h/settings-auth-dry-run.png`
7. dummy dataで再生成できるその他のtracked smoke screenshots

`tests/fixtures/sample-recording.webm` は製品test fixtureであり、auth artifactと同一視しない。削除判断はtest ownerが行う。

今回これらを削除・移動していない。

## 17. Git history rewriteが必要になる条件

次のいずれかが成立した場合だけ、history rewriteを提案する。

1. P0 credentialの具体値がreachable historyに保存されている。
2. session / refresh token / reusable password等の再利用可能なauth情報が保存されている。
3. expiredでも法務・privacy上削除が必要なpersonal dataがbinary artifactにある。
4. repository visibility、fork、mirror、cacheにより、forward deleteだけではcontainment要件を満たせない。
5. security ownerがrotationだけでは不十分と判断する。

現在は上記の証拠がないため、history rewriteは不要である。binary artifactを履歴から消すこと自体をhygieneとして行う場合も、force-push、fork、clone、CI cacheへの影響を別途承認する。

## 18. Prevention measures

Phase B1候補。今回実装しない。

### `.gitignore` / path gate

- `test-results`の派生名も捕捉するruleを追加する。
- `playwright-report`の派生名、trace、auth artifact、swapを明示的に拒否する。
- `tests/e2e/.auth/`のignoreを維持する。
- fixture mediaまで誤って禁止しないよう、directoryとpurposeを限定する。
- CIでartifact pathがtrackedになった時点でfailする。

### Playwright retention

- auth setup projectではtrace / screenshot / videoをdefault offにする。
- 必要時だけlocal isolated runで明示opt-inし、短いretentionと自動cleanupを設定する。
- trace upload前にnetwork body、header、storage state、form valueが含まれないsafe modeを確認する。
- real email / password / magic linkを使うtestとmock / fixture testを分ける。

### Safe logging / error handling

- auth logはfixed reason code、status、boolean、route category、internal correlation IDに限定する。
- full origin、redirect URL、nextPath query/hash、cookie name list、provider error bodyを出さない。
- client responseへraw provider `Error.message`を返さない。
- test assertionはstatusとsafe reason codeだけを出し、payload全体をstringifyしない。
- framework / hosting request logのquery redactionを運用側でも確認する。

### E2E credentials

- fallback credentialはreal environmentで使用しない。
- test-loginはstrict test runtime、ephemeral account、explicit enable flagに閉じる。
- production / preview deployでE2E routeとE2E envが無効であることをpreflightとruntimeの両方で確認する。
- reviewer credentialはrepo、docs、trace、screenshot外で受け渡す。

### Secret scanning

- GitHub Secret Scanning / Push Protectionを利用可能なら有効化する。
- generic secret、legacy token、binary、zip、画像は検出漏れがあるため、custom artifact path gateとmetadata-only archive scanを併用する。
- scan結果にはmatched valueやhashを残さず、category、path、countだけを保持する。

## 19. Human decisions required

最大5件:

1. `CONFIRMED_EXPOSURE=0`を根拠に、即時rotationを行わずPhase B1へ進む判断を承認するか。
2. Phase B1でtracked `test-results 2/` 12件と`.middleware.ts.swp`をcurrent treeから除外するか。
3. auth log / error responseをfixed reason code、boolean、correlation IDへ縮退する変更を承認するか。
4. auth setupのPlaywright artifactをdefault offにし、ignore / CI artifact gateを追加するか。
5. confirmed secretなしでも、repository visibilityまたはprivacy policyを理由にbinary artifactのhistory rewriteを検討するか。

## 20. Recommended next phase

次は **Phase B1「認証成果物のforward cleanupと再発防止」** を推奨する。

推奨scope:

1. current treeからauth test artifactとswapを除外
2. `.gitignore`とCI artifact path gateを強化
3. auth setupのtrace / screenshot / video retentionを安全化
4. auth log、provider error、test assertionをsafe reason codeへ変更
5. metadata-only regression scanを追加

Phase B1ではcredential rotation、provider operation、Git history rewriteをdefault scopeに含めない。新しい具体的証拠が出た場合だけ、別の明示承認されたcontainment Phaseへ切り替える。

## Phase B0 stop record

- 作成・変更したrepo file: `docs/security-auth-artifact-triage.md` のみ
- 既存 `docs/ultra-release-audit.md`: 未変更
- source code / config / migration / environment: 未変更
- deletion / revoke / rotation / history rewrite: 未実施
- external credential validation / provider API call: 未実施
- commit / push: 未実施
- lint / build / typecheck: 文書のみの安全調査のため未実施

## 21. Phase B1A forward cleanup update

実施日: 2026-07-17

B0の`CONFIRMED_EXPOSURE=0`を維持したまま、current treeのforward cleanupと再発防止を実装した。新しいconcrete credentialは確認しておらず、credential rotationとGit history rewriteは引き続き不要である。

### Cleanup結果

- trackedだった`test-results 2/` 12件を削除した。auth setupのerror context、PNG、trace、WebM 4件と、明確なUI smoke出力8件を含む。
- trackedだった`.middleware.ts.swp`を削除した。
- `artifacts/rr-2b-settings-smoke.png`、`artifacts/rr-2g/settings-db-dry-run.png`、`artifacts/rr-2h/settings-auth-dry-run.png`は、本書から参照されるrelease / dry-run証跡であり、generated test outputと断定できないため保持した。画像内容や秘密値は報告しない。
- `tests/fixtures/sample-recording.webm`と`ios/App/App/Assets.xcassets/`以下は意図的なfixture / product assetとして保持した。

### 再発防止

- `.gitignore`は`test-results*`、`playwright-report*`、`blob-report*`、Playwright auth state、storage/auth state JSON、trace archive、swap、Xcode / Simulator generated stateを対象にした。fixture mediaやintentional docs画像を広く除外するpatternは追加していない。
- auth setupとunauthenticated auth guardを専用Playwright projectへ分離し、trace / video / screenshotを固定で`off`にした。一般UI smoke projectの失敗時debug設定は維持した。
- auth setupのrequest failureはstatusだけをassertion messageへ残し、response payloadをPlaywright reporterへ渡さない。一般UI helperの詳細failure payloadはB1A2まで現状維持する。
- storage stateとauth project outputはrepo外のOS一時領域だけに置く。directoryは`0700`、state fileは`0600`で作り、global setupでstale stateを削除し、global teardownで実行後に再帰削除する。artifact保存を環境変数1つで再有効化する仕組みは追加していない。
- `npm run check:auth-artifacts`は`git ls-files -z`のpathだけを検査し、blocked pathがtrackedならcategoryとpathだけを出してfailする。ファイル本文は読まない。checker自体のsynthetic path self-testは`npm run check:auth-artifacts:self-test`で実行できる。
- standalone checkerは既存の総合check契約を大きく変えないよう自動連結せず、ship / commit前の明示checkとしてREADMEへ追加した。

### 残件

B0のP0 / P1 / P2は歴史的な調査結果として`0 / 4 / 5`を保持する。B1A後のopen remediationはP0 0件、P1 3件、P2 0件である。P1 3件はfull redirect / next-path logging、raw callback error metadata、raw provider error / Playwright failure payloadであり、auth route本体やdirtyなDeveloper checkoutと競合させないためB1A2へ残す。具体的にはfixed reason code、status、boolean、route category、internal correlation IDへ縮退し、full URL、query/hash、cookie名、provider error body、response payload全体を記録・表示しない。

Phase B1Aではauth route、Supabase auth、DB migration、provider、credential、environment、Git historyを変更していない。元のDeveloper checkoutとDesktop checkoutは変更対象外のままで、pushも行わない。
