# Gate1f Web Beta Manual QA Runbook

Gate1f は、Native Minute v1 を Web beta / small cohort に出す前に、人間が production-like 環境で実走確認するための runbook です。ここでは production deploy、DB schema 変更、RLS policy 変更、provider 実装変更、destructive account deletion cleanup は行いません。

## Scope

- 対象: production-like env、manual QA、support contact / SLA decision、Gate1e legal/support draft review。
- 非対象: Store submission、Capacitor、actual account deletion cleanup、formal legal copy finalization、provider 本接続変更。
- Provider 役割:
  - ElevenLabs: voice clone / model audio generation。
  - OpenAI: transcription / Script Studio generation / coaching-adjacent generation。
  - Azure: pronunciation evaluator。
  - Supabase: Auth / database / private Storage / protected replay。

## Required Preflight Order

人間の manual QA の前に、同じ production-like env で次を実行します。secret 値は terminal、スクリーンショット、docs に残さないこと。

```bash
npm run production:preflight
npm run supabase:storage-rls:check
npm run lint
npm run build
npm run typecheck
```

必要に応じて、local/dev baseline では次も実行します。

```bash
npm run e2e:auth-guard
npm run e2e:setup-voice
```

PASS:

- `production:preflight` が strict production の provider / launch mode / E2E env guard を通す。
- `supabase:storage-rls:check` が production-like Supabase の required table / private bucket reachability を通す。
- lint / build / typecheck が通る。
- secret、raw env、storage path、provider voice id、signed URL が出力されない。

BLOCKED:

- production provider が mock のまま。
- `NATIVE_MINUTE_LAUNCH_MODE` が `public_free` または未決で、production preflight が block する。
- required Supabase table / bucket が missing。
- bucket が public。

## Manual QA Environment Record

QA 結果には次を記録します。

- Date / tester。
- Environment: domain, browser, OS, desktop or mobile。
- Provider settings:
  - `VOICE_PROVIDER=elevenlabs`
  - `TRANSCRIPTION_PROVIDER=openai`
  - `PRONUNCIATION_PROVIDER=azure`
  - `SCRIPT_GENERATION_PROVIDER=openai` if real AI draft is enabled。
- Launch mode: `private_beta` or `small_cohort`。
- Supabase project: production-like project name only。URL や key は貼らない。
- Recording duration。
- Result: PASS / WARN / BLOCKED / FAIL。
- Notes: 気になった表示、failure phase、retry した操作。

Do not paste:

- API keys、service role keys、auth headers、magic link URLs、session cookies。
- raw provider response。
- signed URLs、raw Storage object keys。
- provider voice IDs。
- raw audio files or transcripts unless support explicitly requests a safe sample.

## Manual QA Checklist

### 1. Clean Account Signup / Login / Logout

1. 新しい beta test account で `/login?next=%2Fscripts` を開く。
2. Magic link を1回だけ送る。rate limit を避ける。
3. 同じ browser で最新 magic link を開く。
4. `/scripts` に戻る。
5. refresh 後も session が維持される。
6. `/settings` で logout する。
7. `/login?next=%2Fscripts` に戻る。
8. 再 login が通る。

PASS:

- login -> callback -> `/scripts` が通る。
- `/login` 404、`_next/static` 404 が出ない。
- rate limit 時は日本語の safe message が出る。

WARN:

- email delivery が遅いが、rate limit / expired link message は分かる。

BLOCKED:

- callback が継続して失敗する。
- session が refresh で消える。
- logout 後に再 login できない。

### 2. Existing Account Login

1. 既存 beta account で login する。
2. Home に最新結果が出る場合は内容を確認する。
3. Settings / Practice / Progress に移動できる。

PASS:

- 既存 data が見える。
- 他 user の data が見えない。

FAIL:

- 別 user の script、take、audio、deletion request が見える。

### 3. Home / Practice / Script Studio

1. `/` を開く。
2. 「今日の1分」主 CTA が分かる。
3. `/scripts` で Practice library として script を選べる。
4. `/scripts/new` で template / free writing / AI draft のいずれかから script を作れる。
5. 保存後 `/scripts/[id]/listen?created=1` に進む。

PASS:

- script generation が主役に見えすぎず、練習追加の一手段として読める。
- 保存後 handoff が自然。

WARN:

- 空状態や初回説明が少し薄いが、練習開始は迷わない。

BLOCKED:

- script 保存ができない。
- 保存後の route が 404 / auth loop になる。

### 4. Listen

1. `/scripts/[id]/listen` を開く。
2. voice setup が不足していれば、自然に `/setup/voice` へ誘導される。
3. ElevenLabs default voice がある状態で見本音声を生成する。
4. replay できる。
5. 同じ条件で再生成し、cache reuse 表示 / behavior を確認する。
6. playback speed が cache / saved audio identity と混ざって見えないことを確認する。

PASS:

- 見本音声を生成・再生できる。
- protected replay route 経由で再生される。
- provider / cache / Audio Library の説明が前面に出すぎない。

WARN:

- style 差が小さいが、練習には使える。

BLOCKED:

- ElevenLabs env / quota / kill switch で見本音声が作れず、recovery も分からない。
- raw Storage path、signed URL、provider voice ID が画面に出る。

### 5. Record / Upload / Evaluate

1. `/scripts/[id]/record` に進む。
2. browser microphone permission を許可する。
3. 30〜60秒程度の明瞭な英語を録音する。
4. upload / evaluate を実行する。
5. OpenAI transcription + Azure pronunciation evaluator を通る。

PASS:

- recording upload が成功する。
- evaluate 後に review へ遷移する。
- transcript が空ではない。

WARN:

- mobile Safari / Android Chrome で permission や audio format に browser-specific な注意があるが、recovery が読める。

BLOCKED:

- upload failure と provider failure が混同される。
- empty transcript なのに録り直し guidance が出ない。
- OpenAI / Azure raw detail や secret-like value が UI に出る。

### 6. Review

1. review first view を確認する。
2. 総合スコア、今日の直すポイント、短い日本語 coach、もう一度録音 CTA を確認する。
3. 詳細を開き、transcript / score grid / weak words / comparison を確認する。

PASS:

- first view で次に直すことが分かる。
- score grid、weak words、coach / next step が表示される。
- 詳細は必要な人だけ開ける。

WARN:

- score variation があるが、学習補助として理解できる。

BLOCKED:

- review が保存されない。
- weak words / coach feedback が欠ける。
- raw provider payload が見える。

### 7. Progress / 2nd Take Continuity

1. `/progress` で最新結果を確認する。
2. 同じ script で2回目の record / evaluate / review を行う。
3. `/progress` で latest / best / improvement / review link を確認する。

PASS:

- 1回目と2回目の take が同じ script に紐づく。
- latest / best が自然に読める。
- review link から戻れる。

WARN:

- score の差が小さく、improvement copy が弱いが、history としては読める。

BLOCKED:

- progress に反映されない。
- latest / best が逆転または別 script と混ざる。

### 8. Settings / Account Deletion Request / Dry-Run

1. `/settings` を開く。
2. logout があることを確認する。
3. Privacy / Terms / Support / Account deletion draft links を確認する。
4. account deletion request を作成できる。
5. confirm step に進める。
6. inventory / provider / storage / DB / Auth dry-run が safe summary だけを出すことを確認する。

PASS:

- request/status/confirm が動く。
- dry-run は count / status / safe notes のみ。
- actual delete は走らない。

WARN:

- confirmed request が残っていて、次回 request 作成では既存 status 表示になる。これは v1 beta では許容。

BLOCKED:

- dry-run response に row id、raw Storage path、object key、signed URL、provider voice ID、email、script本文、transcript、raw auth payload が出る。
- actual deletion が予期せず実行される。

### 9. Privacy / Terms / Support / Account Deletion Pages

1. `/privacy` を開く。
2. `/terms` を開く。
3. `/support` を開く。
4. `/support/account-deletion` を開く。
5. footer と Settings から辿れることを確認する。

PASS:

- `Web beta draft` と明示されている。
- Supabase / OpenAI / Azure Speech / ElevenLabs の役割が正しい。
- account deletion actual cleanup が未実装であることが誤解なく書かれている。

BLOCKED:

- support contact placeholder を残したまま public Web beta に進もうとしている。
- deletion completion SLA が未決のまま beta 参加者へ案内しようとしている。
- OpenAI が voice provider と誤記されている。

### 10. Failure / Rate Limit / Kill Switch Spot Checks

最低限、意図的に安全に再現できるものだけ確認します。

- Magic link email rate limit: message が日本語で分かる。
- Too short / silent recording: 録り直し guidance が出る。
- Provider env missing or kill switch in staging: OpenAI / Azure / ElevenLabs のどこが止まったか分かる。
- Storage upload disabled: upload failure と provider failure が混ざらない。

PASS:

- phase が upload / OpenAI transcription / Azure pronunciation / ElevenLabs voice / review save のどこか分かる。
- raw provider detail や secret が出ない。
- partial review / progress が残らない。

WARN:

- rate limit は人間が解除を待つ必要があるが、message は正しい。

BLOCKED:

- failure 時に success のように見える。
- secret / raw provider response / raw audio が UI や logs に残る。

### 11. Mobile Safari / Android Chrome Quick Check

Web beta 前の最低限:

- Login / magic link callback。
- Home / Practice / Review first view。
- Microphone permission prompt。
- 30〜60秒 recording。
- Upload / evaluate。
- Protected replay。
- Back / refresh navigation。
- Privacy / Terms / Support / Account deletion links。

PASS:

- iOS Safari と Android Chrome の少なくとも各1台で main loop が通る。

WARN:

- 一部 browser で録音 format / permission に注意が必要だが、fallback guidance がある。

BLOCKED:

- mobile で録音できない、upload できない、replay できない。

## PASS / WARN / BLOCKED / FAIL Definition

PASS:

- Web beta small cohort の main loop が production-like env で通る。
- provider guard、Storage/RLS checker、legal/support draft route、support contact/SLA の運用前提が揃う。
- secret / raw provider response / raw Storage detail が出ない。

WARN:

- small cohort では許容できるが、Web public / Store 前には直すべきもの。
- 例: support operation が manual、style 差が微量、mobile browser の軽い注意、legal text が draft。

BLOCKED:

- Web beta に進む前に必ず止めるもの。
- 例: production Supabase spot-check proof なし、support contact 未決、deletion SLA 未決、provider budget proof なし、mock provider 混入、bucket public、cross-user data exposure、actual deletion の説明不備。

FAIL:

- 即修正が必要な不具合。
- 例: login/callback loop、script 保存不可、record/evaluate/review/progress 不通、partial review persistence、secret/raw provider response exposure、unexpected destructive deletion。

## Support Contact / SLA Decisions

Web beta 前に人間が決める項目:

- Public support contact:
  - email address or web form URL。
  - owner / responder。
  - beta participant にどう案内するか。
- Account deletion request first response target:
  - placeholder example: within 3 business days。
  - 実際の値は人間が決める。
- Account deletion completion target:
  - placeholder example: within 30 days after identity/request verification。
  - actual cleanup が manual の間、どの stage を誰が完了確認するかを決める。
- Manual cleanup operator:
  - Supabase DB / Storage。
  - ElevenLabs provider-side voice。
  - Supabase Auth user。
  - quota_events / logs。
- Escalation:
  - provider cleanup failure。
  - Storage cleanup failure。
  - Auth deletion failure。
- What support may request:
  - account email or anonymized request reference。
  - failure phase and screenshot with secrets redacted。
- What support must not request through ordinary channels:
  - password、magic link URL、auth token、API key、raw audio、full transcript、provider voice ID、storage path。

BLOCKED for Web beta:

- no support contact。
- no account deletion first response target。
- no manual cleanup owner。
- no instruction for beta participants.

## Gate1e Draft Legal / Support Review Checklist

Human review before Web beta:

- `/privacy`
  - Data categories match implementation.
  - Supabase / OpenAI / Azure Speech / ElevenLabs processor map is correct.
  - raw provider response / secret / signed URL / raw Storage path policy is accurate.
  - deletion request link is present.
- `/terms`
  - learning aid, not official pronunciation certification.
  - v1 beta / free status is clear.
  - provider failure and score variation are described.
  - voice clone requires user consent / own voice.
  - prohibited content is clear enough.
- `/support`
  - support contact placeholder is replaced before beta.
  - login / recording / evaluation / provider failure guidance matches current app.
  - no instruction asks users to paste secrets or raw provider data.
- `/support/account-deletion`
  - request-based + support/manual cleanup is explicit.
  - actual destructive cleanup not implemented is clear.
  - Store submission blocker is not hidden.
  - deletion target summary matches Gate1d.
  - SLA placeholder is replaced before beta.

BLOCKED:

- processor roles are wrong.
- OpenAI is described as voice provider.
- actual deletion completion is implied even though it is not implemented.
- support contact / SLA placeholders remain for Web beta launch.

## Web Beta Go / No-Go

Go if:

- Required preflights pass.
- Production Supabase / Storage / RLS spot-check proof is recorded.
- Support contact and deletion SLA are decided.
- Gate1e draft routes have human review approval for small cohort.
- One clean account and one existing account manual QA pass.
- Desktop and at least one mobile browser main loop pass.
- Provider budget monitoring / kill switch operation is assigned.

No-go if:

- Any BLOCKED or FAIL item remains.
- actual deletion state is misrepresented.
- mock provider is active in strict production.
- cross-user data or audio is accessible.
- support cannot respond to deletion requests.

## Result Template

```text
Date:
Tester:
Environment:
Browser / OS:
Providers:
Launch mode:

Preflight:
- production:preflight:
- supabase:storage-rls:check:
- lint:
- build:
- typecheck:

Manual QA:
- clean account login/logout:
- existing account login:
- script creation:
- listen / ElevenLabs:
- record / OpenAI transcription / Azure evaluator:
- review:
- progress / 2nd take:
- Settings / deletion request dry-run:
- privacy / terms / support pages:
- mobile Safari:
- Android Chrome:

Result:
- PASS / WARN / BLOCKED / FAIL:
- WARN items:
- BLOCKED/FAIL items:
- Follow-up owner:
```

## Remaining Before Web Beta

- Human support contact decision.
- Account deletion first response / completion SLA decision.
- Production Supabase spot-check proof from Gate1b.
- Provider dashboard budget / alert proof from Gate1c.
- Human review of Gate1e legal/support draft pages.
- Production-like S13c happy path manual QA.

## Remaining Before Store Submission

- Actual account/data deletion completion path.
- Final Privacy Policy / Terms / Support copy.
- Apple Privacy Details and Google Play Data Safety answers.
- iOS Safari / Android Chrome / Capacitor WebView QA.
- Store screenshots / listing copy.
