# Native Minute

固定1分の英語練習に絞った MVP です。

この repo では、同じ台本を

1. `listen` で見本確認する
2. `record` で録音する
3. `review` で保存済み結果を確認する
4. `progress` で5本までの練習スロットから成果を見る

という main loop を最短で回すことを優先しています。

Codex の運用前提は [AGENTS.md](./AGENTS.md) と [docs/current-state.md](./docs/current-state.md) にまとめています。

G5D-2M Auth deletion durable recovery foundation は final independent verdict `G5D_2M_SERVICE_ROLE_REPOSITORY_SELECT_ACL_INDEPENDENT_FOCUSED_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。Durable contract `g5d-2m.auth-delete.v1` は Provider -> Storage -> Database -> Auth -> Completion のうち Auth foundation のみを固定し、GET-first strict verification、current-attempt result binding、generation `0 -> 1` one-winner dispatch、response-loss/unknown recovery、owner-null continuation、atomic Auth sub-finalizationとtarget scrub、legacy Auth fail-close、safe reason redactionを確定しました。`service_role`のrepository SELECTとapplication-role protected SELECT denial、protected UPDATE `0/40`、six RPC security、focused Auth `35/35`、fresh isolated PostgreSQL `0001 -> 0026` proofをPASSし、P1-1/P1-2/P1-3/P1-4はすべて`CLOSED`、P0/P1/P2/correctness UNKNOWN=`0/0/0/0`です。0026 SHA-256は`4c9a34ddb0ded45e02edd345fb0dcebd171cb5aaa5866b5c9ea5b9146e312b81`、0025は`8dcee3373fa67edcbbf9356d708c6d3a722b2f916cfd4659198238a750934814`のままです。Canonical Stagingは`0001`–`0025` exactで0026は未適用、Auth canonical operatorは`NOT WIRED`、Completionは`NOT IMPLEMENTED`、real Auth GET/DELETEとStaging/Production mutationは0です。G5D-2/Gate 5は`OPEN`で、exact nextは未開始の`G5D_2N_MIGRATION_0026_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE`です。詳細は [G5D-2M result](./docs/g5d-2m-auth-deletion-durable-recovery-foundation-result.md) を参照してください。

G5D-2L DB finalizer canonical operator wiring は independent verdict `G5D_2L_DB_FINALIZER_CANONICAL_OPERATOR_WIRING_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。Canonical entryをexplicit Provider -> Storage -> Database -> future Auth -> future completion routingへ更新し、persisted exact owned prior-stage eligibility、focused RPC最大1回、post-RPC exact owned terminal re-fetch、verified D/A/R evidence、unknown/exception fail-closeとobserved invocation保持、User A/B isolation、raw diagnostic/identifier redactionを確認しました。同一invocation stage chaining、Migration/schema/generated DB types/0025 SQL、Canonical Staging/Production mutation、real finalizer、Provider/Storage external call、Auth/completion、legacy DB、guard enableは0です。Canonical Stagingは`0001`–`0025` exact・pending 0、P0/P1/P2/correctness UNKNOWN=`0/0/0/0`。Auth deletion/recovery、completion、live Account deletion proof、future expiry/purge/controlは未完了で、G5D-2/Gate 5は`OPEN`です。exact nextは未開始のread-only `G5D_POST_2L_AUTH_COMPLETION_NEXT_UNIT_RECONCILIATION`です。詳細は [G5D-2L result](./docs/g5d-2l-db-finalizer-canonical-operator-wiring-result.md) を参照してください。

G5D-2K migration `0025` controlled Staging apply は independent verdict `G5D_2K_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_INDEPENDENT_READ_ONLY_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。Exact source `22715148bd1783daba07531854e9e1ddb111aba5` のmigration `0025`（SHA-256 `8dcee3373fa67edcbbf9356d708c6d3a722b2f916cfd4659198238a750934814`）だけをCanonical Staging `native-minute-staging`（`ztlliqishddrrvqqrrlu` / `ap-northeast-1` / `ACTIVE_HEALTHY`）へnormal linked pushで1回適用し、history `0001`–`0025` exact・pending 0、finalizer/helper/trigger/terminal-column ACL、Provider 8/8、Storage 10/10、constraints/indexes、public table exact 18、GUC/backdoor 0をactual catalogでPASSしました。G5D-2Jのisolated PostgreSQL behavioral proofとG5D-2KのCanonical Staging deployment/catalog proofを区別し、pre/post 18-table row count/fingerprintは全件一致してapplication-row mutation 0、Staging finalizer execution、cleanup/anonymization、Provider/Storage/Auth、completion、Production、guard enableは0です。P0/P1/P2/correctness UNKNOWN=`0/0/0/0`、G5D-2/Gate 5は`OPEN`。exact nextは未開始のread-only `G5D_POST_2K_DB_OPERATOR_NEXT_UNIT_RECONCILIATION`です。詳細は [G5D-2K result](./docs/g5d-2k-migration-0025-controlled-staging-apply-and-non-destructive-smoke-result.md) を参照してください。

G5D-2J atomic DB/anonymization finalizerは final independent verdict `G5D_2J_MIGRATION_SHA_FOCUSED_TEST_COVERAGE_INDEPENDENT_READ_ONLY_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。Focused RPCはone PostgreSQL transaction内でuser-scoped lock、exact request lock、persisted Provider/Storage prerequisite、static exact 18-table inventory、blocking authority、explicit DELETE/CASCADE、quota/voice audit retention、post-state verification、exact D/A/R count、terminal persistenceを行い、already-finalized replayとprior evidence corruptionもmutation 0でfail-closeします。fresh disposable Supabase `0001`–`0025` runtime proof、full `26=17+3+6`、zero/not_needed `1=0+0+1`、rollback/replay/concurrency/User A-B/ACL/security、focused 11/11とregressionsをPASSしました。migration `0025` SHA-256は`8dcee3373fa67edcbbf9356d708c6d3a722b2f916cfd4659198238a750934814`です。Canonical Staging deployed historyは`0001`–`0024` exactのまま`0025 UNAPPLIED`、DB operator/Auth/completion wiring、actual cleanup、purge、live deletion proof、external call、Production、guard enableは0です。P0/P1/P2/correctness UNKNOWN=`0/0/0/0`、G5D-2/Gate 5は`OPEN`。exact nextは未開始の`G5D_2K_MIGRATION_0025_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE`です。詳細は [G5D-2J result](./docs/g5d-2j-atomic-db-finalizer-rpc-and-transactional-runtime-proof-result.md) を参照してください。

G5D-2I migration `0024` controlled Staging apply は independent verdict `G5D_2I_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_INDEPENDENT_READ_ONLY_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。Exact source `27d603c2a4f728cc8e06d9be3403874312347f6f` のmigration `0024`（SHA-256 `2350308fe953307f3feef10f96d74edc9dbd772ff69acf233ce73ee8380dab73`）だけをCanonical Staging `native-minute-staging`（`ztlliqishddrrvqqrrlu` / `ap-northeast-1` / `ACTIVE_HEALTHY`）へnormal linked pushで1回適用し、history `0001`–`0024` exact・pending 0、quota existing 10行へのintended `attempted_at + 90 days` metadata backfill 10/10・invalid 0・identity/content/`updated_at`変化0、Voice operation/target・quota・account request DB evidence・terminal protection・ACL/securityのactual catalog、public table exact 18と全件数不変をPASSしました。G5D-2Hのisolated PostgreSQL behavioral proofとG5D-2IのCanonical Staging deployment proofは区別し、actual cleanup/anonymization、Auth/Provider/Storage/completion/purge、Production、guard enableは0です。P0/P1/P2/correctness UNKNOWN=`0/0/0/0`、G5D-2/Gate 5は`OPEN`。exact nextは未開始の`G5D_POST_2I_ATOMIC_DB_FINALIZER_NEXT_UNIT_RECONCILIATION`です。詳細は [G5D-2I result](./docs/g5d-2i-migration-0024-controlled-staging-apply-and-non-destructive-smoke-result.md) を参照してください。

G5D-2H DB anonymization / retention / owner lifecycle schema foundation は final independent verdict `G5D_2H_DB_ANONYMIZATION_RETENTION_OWNER_LIFECYCLE_SCHEMA_FOUNDATION_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。Exact 18-table contract `g5d-2h.account-db.v1`、migration `0024`、safe completed Voice auditのowner-null/90日retention、quota identifier scrubと`attempted_at + 90 days` retention、account request DB evidence、future atomic finalizerまでのDB terminal fail-close、legacy sequential DB executor guardを確定し、clean `0001`–`0024` proofとindependent nonzero quota backfill proofをPASSしました。Canonical Stagingは`0001`–`0023` exactのまま、`0024`は未適用です。Atomic DB finalizer、DB operator wiring、Auth deletion/recovery、completion、purge、live account deletion proofは未完了のため、G5D-2/Gate 5は`OPEN`です。詳細は [G5D-2H result](./docs/g5d-2h-db-anonymization-retention-owner-lifecycle-schema-foundation-result.md) を参照してください。

G5D-2G Storage durable canonical operator wiring は final independent verdict `G5D_2G_SAFE_INTEGER_COUNTER_SANITIZER_INDEPENDENT_FOCUSED_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。P1-1 Safe Integer Counter Sanitizerは`CLOSED`で、Provider -> Storage -> future DB/anonymization -> future Auth -> future completionの順序、persisted Provider terminalから次invocationだけでのStorage進行、pending/collecting seal-only、sealed durable runner exactly once、target action最大1、persisted Storage sub-finalizerだけのterminal authority、runtime unknownのfail-close/observed-action保持、User A/B isolation、redaction、Provider regressionsをPASSしました。同一invocation stage chaining、migration/schema変更、Staging/Production mutation、real Storage/Provider、DB/Auth/completion、guard enableは0です。Canonical Stagingは`0001`–`0023` exact・pending 0、P0/unresolved correctness P1/P2/correctness UNKNOWNは`0/0/0/0`。DB/anonymization、Auth、completion、live Account deletion proofは未完了のためG5D-2/Gate 5は`OPEN`です。次は開始せず、exact nextはread-only `G5D_POST_2G_DB_ANONYMIZATION_NEXT_UNIT_RECONCILIATION`。詳細は [G5D-2G result](./docs/g5d-2g-storage-durable-runner-canonical-operator-wiring-result.md) を参照してください。

G5D-2F migration `0023` controlled Staging apply は independent verdict `G5D_2F_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_INDEPENDENT_READ_ONLY_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。Exact committed migrationだけをCanonical Staging `native-minute-staging`（`ztlliqishddrrvqqrrlu` / `ap-northeast-1`）へnormal linked pushで1回適用し、history `0001`〜`0023` exact、pending 0、Storage parent fields/constraints 15/15・6/6、prior Provider fields 12/12、target columns/lifecycle constraints/indexes 25/25・11/11・5/5、dual CASCADE FK/Auth SET NULL、4 bucketのauthenticated owner SELECTとmutation bypass 0、RLS/service-role SELECT-only ACL、Storage RPC/trigger 10/10・8/8、prior Provider RPC/trigger 8/8・3/3をread-onlyでPASSしました。G5D-2Eのisolated PostgreSQL behavioral proofとG5D-2FのCanonical Staging deployment/catalog proofは区別し、G5D-2Fでlive destructive behaviorを実行していないことは意図したboundaryであってUNKNOWNではありません。mutation RPC、Account deletion request/snapshot/lease/delete/verification/finalizer、Storage object/upload/info、Provider、DB cleanup、Auth、completion、Production、guard enableは0です。P0/P1/P2/correctness UNKNOWNは`0/0/0/0`、G5D-2/Gate 5は`OPEN`。次はread-only `G5D_POST_2F_NEXT_TECHNICAL_UNIT_RECONCILIATION`だけで、今回は開始しません。詳細は [G5D-2F result](./docs/g5d-2f-migration-0023-controlled-staging-apply-and-non-destructive-smoke-result.md) を参照してください。

G5A consent foundation は `CLOSED_COMMITTED_PASS`、`G5A_STAGING_MIGRATION_0013` は `APPLIED_VERIFIED_PASS` です。implementation `1d360205cfb6e12f6b5c16fabb1c1021505cb838`、P1 remediation `b04288dbe3aa4d32b1b616ebb2021de18862ba7d`、evidence commit `7ba9cf2f42dd77f3159587743226a85b7d6d9b3e`によるfinal read-only auditは `FINAL_CLOSEOUT_AUDIT_PASS` です。録音の OpenAI / Azure 処理と ElevenLabs voice cloning を別々のversioned server-canonical consentとして扱い、`0013`はStagingだけへ通常CLI workflowで適用済みです。実Staging PostgreSQLでowner RLS、DB-authored timestamps、immutable withdrawal history、re-consent、User A/B isolation、trigger attachmentを確認し、exact Staging BFFでMobile/Webのcanonical consent application smokeもprovider call 0でPASSしました。P2はWeb `/api/create-voice`の不要内部voice row responseと、repo migration-contract testのtrigger attachment assertion不足（attachment自体は実Staging catalogで証明済み）です。copyは `PRODUCT CONSENT COPY / HUMAN-APPROVED INTERIM` であり、final legal approvalは未完了です。詳細は [G5A consent foundation result](./docs/g5a-canonical-recording-and-voice-consent-foundation-result.md) を参照してください。Gate 5全体はOPENのままで、retention、voice-only withdrawal/deletion、account deletion operational path、partial-failure/retry/idempotency、destructive proof、reviewer closeout、Production migration/applyは未完了です。

G5B Mobile Settings / Legal / Account Deletion Entry は `CLOSED_COMMITTED_PASS` です。exact Staging native artifactでSettings、canonical consent、Privacy / Terms / Support、専用account-deletion entryを確認済みです。見つかったMobile deletion routeのHTML 404はStaging BFF deployment driftであり、clean exact sourceを既存Staging projectだけへdirect deploy後、scripts/status/requestはJSON auth boundaryへ復旧しました。実機ではcanonical `not_requested` status、account-deletion informationのnative Browser open/close、session維持をPASSしました。final auditの残P2だった`23505` active-request insert raceはcanonical domain serviceを直接呼ぶfocused testでPASSし、race後のUser A canonical requestを`created:false`で再利用し、duplicate insertやraw error leakを起こさないことを確認しました。新しいdeletion request、actual deletion、confirmation、provider/Storage/DB/Auth cleanup、voice-only deletionは実行していません。P0=0、P1=0、P2=0。Gate 5全体はOPENのままです。詳細は [G5B result](./docs/g5b-mobile-settings-legal-and-deletion-entry-result.md) を参照してください。

## workspace guard

この repo の正しい作業場所は `/Users/karasawatakahiro/Developer/native-minute` です。`/Users/karasawatakahiro/Desktop/native-minute` や隔離済み Desktop checkout は編集・参照しません。作業前と検証前に `npm run check:workspace` を実行すると、cwd / git root / Desktop 側 checkout の存在を検査して、混線時は non-zero で停止します。

App Store / Google Play 掲載へ向かう store-release-mainline の現状、Gate map、Web beta smoke、Gate 1.5 voice consent / clone voice server-side architecture review は [docs/store-release-mainline-inventory.md](./docs/store-release-mainline-inventory.md) にまとめています。
Script Studio の設計メモは [docs/script-studio-plan.md](./docs/script-studio-plan.md) にあり、freeze / quota / cost control の詳細は [docs/script-studio-freeze-quota-plan.md](./docs/script-studio-freeze-quota-plan.md) に分けています。Phase S4d で、見本音声生成前の preflight design を [docs/script-studio-voice-generation-preflight-plan.md](./docs/script-studio-voice-generation-preflight-plan.md) に固定し、Phase S4e で `/scripts/[id]/listen` に preflight-only の UX copy を追加しました。Phase S4f では quota event design を [docs/script-studio-quota-event-plan.md](./docs/script-studio-quota-event-plan.md) に固定し、Phase S4g では listen の provider/cache 状態表示を少し整理しました。Phase S4h では `/scripts/new` と `/scripts/[id]/listen` に quota preflight copy only を追加し、Phase S4i ではその表示密度を少し圧縮しました。Phase S5a〜S5e で quota event の schema / write path / implementation plan を固定し、Phase S5f で Script Studio text generation の `script_generation_attempt` だけを non-blocking に記録する初回実装を追加しました。S5f-db-smoke-plan では dev DB migration / mock provider smoke checklist を同 quota event plan に追加しています。Phase S5g では voice generation quota event の初回実装計画を、Phase S5h ではその schema extension plan を同 doc に固定し、Phase S5i で voice quota 用の schema extension / DB types / write service の受け皿を追加しました。Phase S5j では `speakScript` service 境界に non-blocking の voice quota event write を接続しました。S5k-plan では `0009/0010` 適用後の text + voice DB smoke checklist と SQL query を同 doc に統合しました。S5 close check では dev DB 適用後に mock text generation と mock voice generation/cache hit の quota event 記録、privacy spot check、RLS spot check を確認しました。freeze 保存、quota enforcement、voice generation gating にはまだ接続していません。Audio Library の S6a design-only メモは [docs/audio-library-plan.md](./docs/audio-library-plan.md)、S6b の migration / RLS / service interface plan は [docs/audio-library-migration-plan.md](./docs/audio-library-migration-plan.md) にあります。S6c で script-scoped library 用の DB migration / DB types / service skeleton を追加し、S6d/S6e で saved model audio と saved best take の API boundary を追加しました。S6f では listen で現在の見本音声を Audio Library に保存 / 保存解除できる小さな UI、S6g では review で現在の録音をベスト保存 / 保存解除できる小さな UI、S6h では `/progress` に script ごとの Audio Library summary を追加しました。S6i では listen / review / progress をまたぐ Audio Library smoke を確認しました。S7a では speed / voice style の design-only メモを [docs/speed-voice-style-plan.md](./docs/speed-voice-style-plan.md) に追加し、playbackRate と生成時 speed / style の境界を固定しました。S7b では拡張 preset 定義と provider mapper 境界を追加し、S7c では既存4 preset の copy / compatibility alias を整理しました。S7d では listen の生成 style / 再生速度 copy、S7f では listen の表示密度と操作直後の pending feedback、S7g では saved model audio metadata snapshot 表示、S7h では mock 前提の provider-specific mapping 境界、S7i では `npm run voice:style-smoke` による lightweight static smoke を追加しました。旧データは `style: 旧データ / 詳細なし` と表示します。既存 UI / API accepted preset と cache identity はそのまま維持しています。
Brush-up v1 の設計メモは [docs/brush-up-v1-design-plan.md](./docs/brush-up-v1-design-plan.md) にあります。今回は本実装せず、既存お手本を上書きしない candidate 方針、Review 起点、既存 `script_audios` / saved model audio で足りる可能性と storage identity の未決点を整理しています。
実 provider live smoke / 再 smoke の手順は [docs/voice-provider-smoke-plan.md](./docs/voice-provider-smoke-plan.md) に分けています。ElevenLabs はユーザー実ブラウザで clone voice 作成と script TTS まで成功済みとして扱い、S8d では cached `script_audios` row、generation quota event succeeded、`cache_hit / non_billable` quota row、fresh Audio Library style metadata、privacy-safe metadata まで spot check 済みです。S8e では sample reject / verification required / rate limit / deleted provider voice / storage or replay failure と provider voice cleanup policy を固定し、S8f では setup/listen の failure recovery copy を小さく整理しました。S8g では `natural / expressive / clear / slow` の 4 style が別 cache key / 別 `script_audios` row になることを確認しました。実音声の style 差はあるものの微量で、style 名どおりかは判断しづらい状態です。OpenAI entitlement-sensitive smoke は別に確認します。必要 env、`npm run voice:style-smoke` / `npm run voice:preflight`、失敗時に `VOICE_PROVIDER=mock` へ戻す手順も同 doc にまとめています。
S9a では、OpenAI voice には進まず、Script Studio 改善として `/scripts/new` に `テンプレから選ぶ / フリーライティング・既存原稿貼り付け / AI自動生成 / このアプリ向きの文章ガイド` の4入口を追加しました。テンプレは Native Minute original の少数自作英文だけで、映画セリフや近年の有名スピーチ本文は内蔵しません。どの入口でも最後は既存の手動フォームで編集してから保存します。
S10b/S10c/S10e では、4入口の browser smoke とフォーム内 guidance density polish、保存後 listen handoff を行いました。テンプレコピー後はフォームへ移動しやすくし、手動フォーム内は入力、話しやすさ、保存前チェック、quota 補足、保存の順に読みやすくしています。保存後の `/scripts/[id]/listen` では、作成直後だけ見本音声、record、複製修正への短い案内を出します。DB / API / 保存 flow は変更していません。
S10f では、AI draft 入口を監査し、既定は mock provider の確認用 preview であり、本番AI生成の品質確認ではないことを UI copy で明確にしました。OpenAI adapter は server-side route 境界の内側にありますが、client は provider や secret に触れず、保存前は必ず手動フォームで編集します。
S10g では、AI draft の seed 例と品質期待値を整理しました。`seed 例を見る` から仕事の小さな成功、最近困ったこと、好きなもの、挑戦したいこと、感情がある短い出来事を選べます。良い draft は 45〜75秒、1テーマ、自分が言いそう、意味の塊で練習しやすいことを目安にします。
S10h では、AI mock preview の browser smoke を行い、seed 例から draft を作成し、フォームへコピーして編集・保存し、`/scripts/[id]/listen?created=1` へ進む流れを確認しました。OpenAI live smoke、DB / API / 保存 flow は変更していません。
S10i では、OpenAI script generation の live smoke 前 checklist を整理しました。既定は `SCRIPT_GENERATION_PROVIDER=mock` で、`openai` に切り替える場合も client は adapter / secret / raw response に触れず、server route の safe response だけを表示します。OpenAI live API はまだ実行していません。
S10j では、OpenAI script generation の live smoke を小さく実施しました。日本語 seed から accepted draft が出て、quality report / freeze preflight / form copy / 編集保存 / `/scripts/[id]/listen?created=1` まで通りました。quota metadata は safe count / length / option 値に留め、raw seed / generated draft text / raw provider response / secret / playbackRate は保存していません。
S10k では、OpenAI draft quality を少数 seed で監査しました。初回は短めに出やすかったため、prompt pack に target word range と、短い seed でも具体的な理由・例を足す指示を追加しました。再確認では 5 seed すべて accepted、blocking reason なしになりました。long chunk warning が残る候補は、フォームへコピー後に短く直す前提です。
S10l では、OpenAI draft を `/scripts/new` の実 UI から作成し、フォームへコピーして編集・保存し、`/scripts/[id]/listen?created=1` へ進む browser smoke を確認しました。入力 seed は入力欄以外で raw text として再掲せず、long chunk warning は編集ポイントとして案内します。DB / API / 保存 flow / cache key は変更していません。
S10m では、OpenAI draft の long chunk warning が出やすい seed を小さく再確認し、prompt pack に practice shape / chunk shape / sentence boundary の指示を足しました。再 smoke では 3 seed が 79〜89 words、全件 accepted、long chunk 0、blocking reason なしでした。UI では long chunk warning を、コピー後に comma / period で区切る編集目安として案内します。DB / API / 保存 flow / cache key は変更していません。
S10n では、Script Studio の 3入口を統合 smoke しました。テンプレ、フリーライティング、AI draft それぞれで、フォームへの入力またはコピー、軽い編集、保存、`/scripts/[id]/listen?created=1` への handoff まで通ることを確認しました。DB / API / 保存 flow / cache key は変更していません。
S11a では、Script Studio 保存後の実練習導線を smoke しました。テンプレ入口から保存し、`/scripts/[id]/listen?created=1` の handoff、mock 見本音声生成、record upload、review、progress の該当結果導線まで通ることを確認しました。DB / API / 保存 flow / cache key は変更していません。
S11b では、Script Studio 由来 script を同じ script のまま2回練習する continuity smoke を確認しました。2件の take 保存後も、review、progress の `最新結果 / ベスト結果 / 改善の流れ / 最新とベストの差`、record / listen / review link が崩れないことを確認しました。DB / API / 保存 flow / cache key は変更していません。
S12a では、実 provider 本接続前の readiness を [docs/provider-readiness-plan.md](./docs/provider-readiness-plan.md) に整理しました。`/api/evaluate` audio-first、server-owned script re-fetch、atomic review persistence、canonical review/progress source、storage ownership、provider fallback を壊さない contract と、OpenAI transcription / Azure pronunciation evaluator / voice provider / Script Studio OpenAI generation の env、storage、manual smoke、failure recovery をまとめています。実 provider 追加実装、DB schema、API response shape は変更していません。
S12b では、Azure pronunciation evaluator の hardening / manual smoke を行いました。Azure adapter は live API 呼び出し実装済みで、stub ではありません。Azure cancellation / start failure の user-facing error から raw Azure detail を外し、`TRANSCRIPTION_PROVIDER=mock` + 補助 transcript + `PRONUNCIATION_PROVIDER=azure` で `record -> evaluate -> review -> progress` が通ることを確認しました。DB / API / evaluate contract / review persistence / cache key は変更していません。
S12c では、OpenAI transcription live smoke を短い fixture ではなく 30〜60秒程度の local-only 英語 WAV で確認しました。`TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=mock`、および `TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=azure` の両方で `record -> evaluate -> review -> progress` まで通過しています。OpenAI error / empty transcript の user-facing copy は raw provider body を出さず、録音長・無音・明瞭さを確認する案内に寄せています。
S12d では、browser microphone から `OpenAI transcription + Azure pronunciation evaluator` に進む人間録音 smoke checklist を [docs/provider-readiness-plan.md](./docs/provider-readiness-plan.md) に追加しました。browser 録音が webm の場合も、Azure 選択時は upload 前に client-side で wav/PCM へ正規化してから保存します。
S12e/S12f では、ユーザー実ブラウザの人間マイク録音で `OpenAI transcription + Azure pronunciation evaluator -> review -> progress` が通ったことを S12 close 状態として同期しました。review では non-empty transcript、score grid、weak words が表示され、progress に反映されています。DB / API / evaluate contract / review persistence / canonical source / cache key は変更していません。
S13a では、本番前 manual QA checklist と targeted failure smoke plan を [docs/provider-readiness-plan.md](./docs/provider-readiness-plan.md) に追加しました。happy path は script 作成、listen、30〜60秒録音、OpenAI transcription + Azure evaluation、review、progress、2回目練習、mobile / desktop、refresh / back navigation を見ます。次の failure smoke は empty transcript / too short、OpenAI env missing、Azure env missing を優先します。

S13b では、targeted failure smoke 3 件を確認しました。短すぎる local-only PCM WAV は OpenAI transcription の safe error になり、30〜60秒程度の明瞭な英語で録り直す recovery に進みます。isolated env で OpenAI transcription env missing と Azure env missing を再現し、どちらも provider 設定不足として切り分けました。partial review / progress は保存しない前提を確認し、secret / raw provider response / raw audio は表示・保存していません。

S13c では、本番前 manual QA 実走パックを [docs/provider-readiness-plan.md](./docs/provider-readiness-plan.md) に追加しました。desktop / mobile の happy path、listen / record / review / progress の pass criteria、mobile / Safari 注意点、QA 結果記録テンプレート、Codex 自動確認と人間確認の分担を整理しています。実装、DB / API / evaluate contract は変更していません。

UX-R1 では、`/` を practice-first Home に寄せました。ログイン後は「今日の1分」を始める、前回の続き、新しい練習を追加、最新結果の短い要約、progress への小さい導線を first view に置きます。voice setup は不足時だけ補助表示し、top nav は `Home / Practice / Progress / Settings` に寄せました。`/scripts` は Practice library として、別 script の選択・複製・新規追加の場にしています。

UX-R2 では、`review` の first view を「次に直すこと」中心に圧縮しました。総合スコア、今日の直すポイント、一言アドバイス、もう一度録音する CTA を先に出し、transcript 全文、score grid、weak words 詳細、比較は「詳細を見る」に下げています。review persistence、canonical source、`/api/evaluate` contract、DB schema は変更していません。

UX-R3 では、`scripts / listen / record` の first view を practice-first に寄せました。Practice library は「今日の練習を選ぶ」、listen は「見本を短く聞いて record へ」、record は「録音して評価へ」を先に出します。台本全文、practice chunks、cache / freeze / quota / provider 前提、recovery の詳細は details 側へ下げ、listen / record / upload / evaluate の flow は変えていません。
UX-R4 では、voice setup と Script Studio を普段使いの主導線から一段奥へ下げました。`/setup/voice` は見本音声が必要なときの設定画面として見せ、provider readiness / diagnostics / manual smoke は details 側へ移しました。`/scripts/new` は「新しい練習を追加する」画面として、テンプレ / 自由入力 / AI draft を練習追加の手段に寄せています。v1 mainline の voice provider は ElevenLabs、OpenAI は transcription / script generation / coaching、Azure は pronunciation evaluator です。

UX-R5 では、store screenshot readiness に向けて visual polish を小さく入れました。Home / Practice library / Add practice / setup voice / listen / record / review / progress の first view は、practice-first の情報設計を保ったまま、余白、hero surface、主 CTA、mobile 幅の button stacking、summary-first review card を整えています。DB / API / provider contract は変更していません。

RR-2a では、request-based account deletion の受け皿として `account_deletion_requests` migration を追加しました。active request は user ごとに 1 件、`user_id` は Auth deletion 後に null へ落とせる `on delete set null`、完了後の短期 tracking は opaque な `anonymized_user_ref` で扱います。RR-2a-preflight で direct client insert は閉じ、RLS は own read のみにしました。RR-2b では `/settings` と deletion status / request / confirm API を追加し、request 作成・確認・状態表示だけを server-side 経由で行います。RR-2c では safe inventory dry-run を追加し、削除対象の DB row counts / storage object counts / ElevenLabs voice candidate count だけを server-side で集計します。RR-2d では deletion job の stage order / guard を dry-run で確認できるようにしました。RR-2e では ElevenLabs provider cleanup dry-run を追加し、provider voice id を返さず required / blocked / not_needed の safe summary だけを表示します。RR-2f では storage cleanup dry-run を追加し、bucket ごとの DB-known count / listed count / orphan and missing count だけを表示します。storage path、object key、signed URL は返しません。RR-2g では DB cleanup dry-run を追加し、table ごとの candidate count と cascade dependent / explicit delete / delete-last / retain-anonymize の分類だけを表示します。RR-2h では Supabase Auth deletion dry-run を追加し、service role 必須、DB cleanup 待ち、Auth user presence、anonymized tracking 前提だけを safe summary として表示します。row id、script 本文、transcript、raw metadata、auth raw payload、session detail は返しません。RR-3b〜RR-3e で ElevenLabs provider cleanup、Storage cleanup、DB cleanup / anonymize、Supabase Auth deletion の actual service boundary を destructive guard 付きで追加しましたが、通常実行では real provider / Storage / DB / Auth cleanup は呼びません。RR-3f で destructive audit runbook、RR-3g で operator/admin execution surface design を追加し、RR-3h で internal CLI runner skeleton `npm run account-deletion:operator` と self-test を追加しました。CLI は dry-run default / 1 stage per run / safe output で、proof path / latest dry-run runnable / prior stage satisfied の guard を model します。RR-3i では fake-first stage service seam を追加し、guard がすべて通った場合だけ injected fake service を呼べることを self-test しました。RR-3j では [final safety review](./docs/rr-3j-final-safety-review.md) を追加し、stage order / guard / failure / proof policy の整合と、real service 接続前の remaining gap を固定しました。RR-3k では [safe request resolver / wrapper](./docs/rr-3k-safe-request-resolver-wrapper.md) を fake-first で追加し、operator request ref を internal-only target に解決する seam と safe summary sanitizer の関係を self-test しました。RR-3l では [read-only request resolver / status proof](./docs/rr-3l-read-only-request-resolver-status-proof.md) を追加し、`status` / `summary` stage だけ account deletion request を server-side で読めるようにしました。RR-3m では [disposable proof request selection](./docs/rr-3m-disposable-proof-request-selection.md) を追加し、proof candidate の PASS/BLOCKED 条件と準備 checklist を safe output で固定しました。RR-3n では [fake-only proof log rehearsal](./docs/rr-3n-fake-only-proof-log-rehearsal.md) と `npm run account-deletion:operator:rehearsal` を追加し、provider -> Storage -> DB -> Auth -> completion の fake sequence を safe JSON/markdown で出せるようにしました。RR-3o では [sample disposable proof package](./docs/rr-3o-sample-disposable-proof-package.md) と `npm run account-deletion:proof-package:self-test` を追加し、fake-only proof package の転記形と raw data absence を確認できるようにしました。RR-3p では [disposable fixture / dry-run proof checklist](./docs/rr-3p-disposable-fixture-dry-run-proof-checklist.md) を追加し、future disposable proof 前の fixture 条件と dry-run GO/WARN/BLOCKED/FAIL を docs-only で固定しました。RR-3 / Gate 1 の現状は [current status inventory](./docs/rr-3-gate1-current-status-inventory.md) に整理しています。RR-3q では [read-only disposable request status rehearsal](./docs/rr-3q-read-only-disposable-request-status-rehearsal.md) を追加し、operator status / summary、fake rehearsal、sample proof package、dry-run checklist、preflight/checker の非破壊 evidence sequence と proof 転記先を固定しました。RR-3r では [future disposable proof package template](./docs/rr-3r-future-disposable-proof-package-template.md) を追加し、将来の disposable live proof で使う空欄、RR-3q evidence flow との対応、RR-3o fake sample との差分、raw data 非記録ルールを固定しました。通常 CLI は destructive stage の real service 未接続で、real actual cleanup にはまだ接続していません。public 実削除 UI / API と destructive job runner はまだ追加していません。

G5D-1 provider-only internal operator vertical slice は independent verdict `G5D_1_INDEPENDENT_FOCUSED_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。canonical `npm run account-deletion:operator` entry から既存 `runElevenLabsProviderCleanupActual` だけへ到達でき、operator request UUID / opaque reference はserver-sideでexact requestへ解決し、raw targetは出力しません。Storage / DB / Auth / completion は未接続、destructive guardはdefault disabled、behavioral proofはfake-onlyです。P0=0、unresolved G5D-1 correctness P1=0、P2=0。multi-target partial success / status-write lossのdurable recovery authority不足はG5D-1 defectではなく、`ACCOUNT_DELETION_PROVIDER_DURABLE_RECOVERY_AUTHORITY_DECISION_BEFORE_G5D_2`としてG5D-2開始前 / G5D-4 live authorization前に解決します。schema/migration要否とG5C durable model再利用可否はUNKNOWNです。詳細は [G5D-1 result](./docs/g5d-1-provider-only-internal-operator-vertical-slice-result.md) を参照してください。

G5D-2A account-specific provider durable recovery は `CLOSED_COMMITTED_PASS` です。migration `0022`、server-only repository、one-step runnerによりexact sealed target universe、automatic DELETE generation `0 -> 1`一回限り、dispatch後GET-first、strict absenceのみverified、present sticky manual、lease/CAS、provider sub-finalizer、locator/source/fingerprint scrubを固定しました。外部Provider DELETE exactly-onceや発行済みstale runnerのlate HTTP fenceは主張せず、B7 Option Dも一般化しません。独立focused review、digest schema qualification review、clean `0001`→`0022` isolated PostgreSQL proof、final independent closeout auditはすべてPASSし、P0/P1/P2/correctness UNKNOWNは`0/0/0/0`です。legacy actual pathは`provider_durable_authority_required`でprovider call前にfail-closeし、real provider / Storage / DB / Auth / completion / G5D-2A closeout時点のStaging mutation / deploy / guard enableは0です。G5D-2A closeout時点では`0022`はcanonical Staging unappliedで、後続G5D-2Cのcontrolled applyは別resultを正とします。G5D-2全体は`OPEN`のままです。詳細は [G5D-2A result](./docs/g5d-2a-account-deletion-provider-durable-state-result.md) を参照してください。

G5D-2B Provider durable canonical operator wiring は final independent verdict `G5D_2B_UNKNOWN_RUNTIME_RESULT_INDEPENDENT_FOCUSED_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。canonical internal operatorのProvider stageはG5D-2A durable repository/one-step runnerを使用し、pending snapshotはseal-only、sealed snapshotは1 invocation最大1 underlying Provider action、非terminal progress/retry/busy/stale/manual/unknownは後続stageへ進めません。terminal successはfocused Provider sub-finalizerのpersisted `succeeded/not_needed`だけです。unknown runtime resultは固定safe `manual_required / provider_stage_result_unknown / unknown`へfail-closeし、観測済みProvider action countと`providerOutcomeUnknown=1`を保持してfalse zeroとraw unknown漏洩を防ぎます。legacy aggregate pathは引き続き`provider_durable_authority_required`でfail-closeし、Storage / DB / Auth / completionは未接続です。P0/P1/P2/correctness UNKNOWNは`0/0/0/0`、real Provider / G5D-2B closeout時点のStaging apply / migration/schema変更 / deploy / guard enableは0です。G5D-2B closeout時点でもmigration `0022`はcanonical Staging unappliedで、後続G5D-2Cのcontrolled applyは別resultを正とします。G5D-2/Gate 5は`OPEN`のままです。詳細は [G5D-2B result](./docs/g5d-2b-provider-durable-runner-canonical-operator-wiring-result.md) を参照してください。

G5D-2C migration `0022` controlled Staging apply は independent verdict `G5D_2C_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_INDEPENDENT_READ_ONLY_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。Canonical Staging `native-minute-staging`（`ztlliqishddrrvqqrrlu` / `ap-northeast-1`）へ`0022`だけをnormal linked pushで1回適用し、actual history `0001`〜`0022`、pending 0、parent/child catalog、dual FK、constraints、RLS/ACL、8 focused RPC、`extensions.digest`、trigger attachment 3/3、relevant count 0/0をread-onlyでPASSしました。G5D-2Aのisolated PostgreSQL behavioral/runtime proofと、G5D-2CのCanonical Staging migration/catalog non-destructive smokeは別evidenceです。mutation RPC、Provider DELETE/GET、account deletion request execution、Storage/DB/Auth/completion、existing product-row mutation、Production mutation、guard enableは0です。P0/P1/P2/correctness UNKNOWNは`0/0/0/0`。G5D-2/Gate 5は`OPEN`のままです。詳細は [G5D-2C result](./docs/g5d-2c-migration-0022-controlled-staging-apply-and-non-destructive-smoke-result.md) を参照してください。

G5D-2D current-schema deletion lifecycle matrix は docs-only authority scopeで `CLOSED_COMMITTED_PASS` です。17 current public tables、4 Storage buckets、Auth、external Provider、operational logsのconcrete 24 resourcesに、logical audit/legal-hold controlを加えた26 authority rowsへ、削除・匿名化・保持・cascade・block、exact absence、90日/24時間/30日 retention、13 open implementation gaps、Storage/DB/Auth future authority、5 account-path migration requirementsを固定しました。実装・migration・Staging mutation・Provider/Storage/DB/Auth callは行っていません。G5D-2/Gate 5は`OPEN`です。詳細は [G5D-2D matrix authority](./docs/g5d-2d-current-schema-delete-anonymize-retain-cascade-matrix-authority.md) を参照してください。

G5D-2E account-deletion Storage durable state は final independent verdict `G5D_2E_SCRIPT_AUDIO_WRITER_FENCE_AND_POSTGRES_RUNTIME_INDEPENDENT_FOCUSED_REVIEW_PASS` を受理して `CLOSED_COMMITTED_PASS` です。P1-1はscript-audio uploadをdurable reservation後のserver/admin Storage writerへ移し、migration `0023`でauthenticated `script-audios` INSERT/UPDATE/DELETEを閉じつつowner SELECT/playbackを保持して`CLOSED`。P1-2はclean disposable local Supabaseの`0001`→`0023` exact apply、schema lint、actual catalog/ACL/trigger/dual-FK、independent-session lease/CAS、DELETE generation/recovery、sub-finalizer/rollback、Auth-null、User A/B runtime proofで`CLOSED`です。G5D-2E closeout時点ではmigration `0023`はCanonical Staging `UNAPPLIED`、real Storage/ProviderとStaging/Production/DB cleanup/Auth stage/completionは0、destructive guardはdisabledでした。P0/P1/P2/correctness UNKNOWNは`0/0/0/0`、G5D-2/Gate 5は`OPEN`のままです。後続G5D-2Fのcurrent statusは上記G5D-2F項を正とします。詳細は [G5D-2E result](./docs/g5d-2e-account-deletion-storage-durable-state-result.md) を参照してください。

Gate 0 auth smoke は human browser で完了扱いです。Settings logout、magic link login、callback -> `/scripts`、refresh session、re-login が通り、`/login` 404 / `_next/static` 404 は再発していません。Gate 0 後の `/setup/voice -> listen` 再開 smoke では、ElevenLabs の `/setup/voice`、`/scripts/[id]/listen`、`/api/speak-script`、`/api/script-audio/[audioId]` が 200 で通り、見本音声の再生と2回目生成 / 再生も実用上問題ありませんでした。今回のログだけでは cache reuse の DB 上の証明まではしていないため、必要なら cost guard / cache behavior の spot check として別途確認します。Gate 1 Web production readiness audit は [docs/gate1-production-readiness-audit.md](./docs/gate1-production-readiness-audit.md) に追加しました。Gate1a で production provider/env guard、Gate1b で Supabase / Storage / RLS runbook/checker、Gate1b proof template、Gate1c で quota / cost guard decision と env kill switch を追加しました。Gate1b の protected replay / cross-user ownership proof は human browser で PASS 済みで、User A own script-audio / take-audio は 200 相当、User B cross-user は 403/404 相当でした。proof は [spot-check proof template](./docs/gate1b-production-supabase-spot-check-proof-template.md) に、secret、raw user id、storage path、object key、signed URL、audio id / take id、raw audio を貼らずに記録します。Gate1c の詳細は [docs/gate1c-quota-cost-guard-decision.md](./docs/gate1c-quota-cost-guard-decision.md)、Gate1g の provider budget / kill switch operations は [runbook](./docs/gate1g-provider-budget-kill-switch-runbook.md) と [proof template](./docs/gate1g-provider-budget-kill-switch-proof-template.md) に人間 dashboard proof を raw 値なしで記録済みです。2026-05-10 の Final Human Check Batch と Azure update では、support contact は `nativeminutes.support@gmail.com`、account deletion first response target は 3 business days、completion target は 30 days、manual cleanup owner は app owner として PASS。Supabase Storage usage / egress も PASS。Azure Speech resource / region / quota / usage visibility、Keys and Endpoint page visibility、pricing tier visibility、pay-as-you-go upgrade、Cost Management、kill switch も raw 値なしで PASS。2026-05-11 の Gate1l update では、Azure pronunciation live smoke も `record -> evaluate -> review -> progress` で PASS、release / deploy / rollback / incident / post-deploy smoke / provider monitoring / support-deletion owner は app owner として記録しました。OpenAI dedicated project / app-side hard cap、ElevenLabs explicit alert、legal/support draft clarity は WARN のままですが、small-cohort Web beta では release owner が受容しています。Web beta decision は full `GO` ではなく `GO WITH WARNINGS` です。Gate1h では [Web beta deploy / rollback / smoke runbook](./docs/gate1h-web-beta-deploy-rollback-smoke-runbook.md) を追加しましたが、実デプロイはしていません。Gate1i では [Web beta release candidate proof / deploy log template](./docs/gate1i-web-beta-release-candidate-proof-template.md) を追加し、誰が・いつ・どの commit/env/check 結果で `GO / GO WITH WARNINGS / BLOCKED` を判断したか、deploy 実行時の pre/post smoke と rollback 判断を raw 値なしで残せるようにしました。Gate1j では [final human-check batch runbook](./docs/gate1j-final-human-check-batch-runbook.md) を追加し、Azure Speech、OpenAI、ElevenLabs、Supabase Storage、support contact、account deletion SLA、legal/support draft review の owner、確認場所、PASS/WARN/BLOCKED 条件、記録先、記録禁止 raw 値を整理しました。Gate1k では [Web beta final no-go checklist](./docs/gate1k-web-beta-final-no-go-checklist.md) を追加し、Final Human Check Batch の結果と Gate1b / Gate1g / Gate1h / Gate1i / Gate1j、RR-3 proof 準備を final decision packet としてまとめました。Gate1d の privacy / support / account deletion actual path decision は [docs/gate1d-privacy-support-account-deletion-decision.md](./docs/gate1d-privacy-support-account-deletion-decision.md) を参照してください。Gate1e で Web beta 用の `/privacy`、`/terms`、`/support`、`/support/account-deletion` draft route を追加しました。Gate1f では [Web beta manual QA runbook](./docs/gate1f-web-beta-manual-qa-runbook.md) を追加し、production-like manual QA、support contact、account deletion SLA、legal/support draft review の合格条件を固定しました。RR-3a では [actual account deletion implementation plan](./docs/rr-3a-account-deletion-actual-implementation-plan.md) を追加し、provider cleanup -> Storage cleanup -> DB cleanup -> Supabase Auth deletion -> completion の順序を固定しました。RR-3b では [ElevenLabs provider cleanup actual](./docs/rr-3b-elevenlabs-provider-cleanup-actual.md) の service / adapter 境界を destructive guard 付きで追加しましたが、通常実行では real ElevenLabs delete は呼びません。RR-3c では [Storage cleanup actual](./docs/rr-3c-storage-cleanup-actual.md) の service 境界を destructive guard 付きで追加しましたが、通常実行では real Supabase Storage delete は呼びません。RR-3d では [DB cleanup / anonymize actual](./docs/rr-3d-database-cleanup-actual.md) の service 境界を destructive guard 付きで追加しましたが、通常実行では real DB cleanup / anonymize は呼びません。RR-3e では [Supabase Auth deletion actual](./docs/rr-3e-supabase-auth-deletion-actual.md) の service 境界を destructive guard 付きで追加しましたが、通常実行では real Supabase Auth deletion は呼びません。RR-3f では [destructive audit / operator runbook](./docs/rr-3f-destructive-audit-operator-runbook.md) を追加し、disposable-account proof の実行条件、停止条件、証跡、raw data 非記録ルールを固定しましたが、destructive guard は有効化していません。RR-3g では [operator/admin execution surface design](./docs/rr-3g-operator-admin-execution-surface-design.md) を追加し、将来の最小 execution surface は内部 CLI、dry-run default、1 stage per run、public UI/API なし、と固定しました。RR-3h では [internal CLI runner skeleton](./docs/rr-3h-internal-cli-runner-skeleton.md) と `npm run account-deletion:operator` を追加し、proof path / latest dry-run / prior stage satisfied を含む safe summary を出せるようにしました。RR-3i では [operator CLI stage service connection](./docs/rr-3i-operator-cli-stage-service-connection.md) を追加し、fake-first service seam と sanitizer を確認しましたが、通常 CLI は actual stage services 未接続で real destructive deletion は実行しません。RR-3j では [final safety review](./docs/rr-3j-final-safety-review.md) を追加し、real service 接続前の gap と disposable proof 前の条件を固定しました。RR-3k では [safe request resolver / wrapper](./docs/rr-3k-safe-request-resolver-wrapper.md) を fake-first で追加し、RR-3l では [read-only request resolver / status proof](./docs/rr-3l-read-only-request-resolver-status-proof.md) を追加し、RR-3m では [disposable proof request selection](./docs/rr-3m-disposable-proof-request-selection.md) を追加し、RR-3n では [fake-only proof log rehearsal](./docs/rr-3n-fake-only-proof-log-rehearsal.md)、RR-3o では [sample disposable proof package](./docs/rr-3o-sample-disposable-proof-package.md)、RR-3p では [disposable fixture / dry-run proof checklist](./docs/rr-3p-disposable-fixture-dry-run-proof-checklist.md) を追加しました。Web beta 前の主な remaining task は、実デプロイと post-deploy smoke です。Store submission 前の blocker は account deletion completion path の disposable live proof です。

Gate1l では [GO WITH WARNINGS acceptance / Azure live smoke checklist](./docs/gate1l-go-with-warnings-acceptance-azure-smoke.md) を追加し、Gate1i に release owner acceptance、accepted WARNs、mitigation、next review date、deploy / rollback / post-deploy smoke owner、post-confirmation Azure pronunciation live smoke result を反映しました。Azure pronunciation live smoke は人間確認で PASS。実デプロイ、real destructive deletion はしていません。

Web beta 前の推奨確認順:

```bash
npm run production:preflight
npm run supabase:storage-rls:check
npm run account-deletion:provider-cleanup:self-test
npm run account-deletion:provider-durable:self-test
npm run account-deletion:storage-cleanup:self-test
npm run account-deletion:database-cleanup:self-test
npm run account-deletion:auth-cleanup:self-test
npm run lint
npm run build
npm run typecheck
```

その後、[Gate1f runbook](./docs/gate1f-web-beta-manual-qa-runbook.md) に沿って clean account / existing account / main loop / Settings / legal support pages / mobile browser を人間が確認します。

## いま何ができるか

- `/` の Home から、今日の練習、前回の続き、新しい練習追加、progress へ進める
- `scripts` で固定1分台本を作る
- `scripts` を Practice library として、まず今日の練習を 1 本選び、`listen / record / script 複製 / 最新結果` を script ごとに選ぶ
- `/scripts/new?from=<scriptId>` で script を安全に複製する
- `/scripts/new` で「新しい練習を追加」し、テンプレ、フリーライティング、AI draft、文章ガイドの4入口から始める
- AI draft では、短い seed 例から候補を作れる。候補は完成品ではなく、フォームへコピーして編集する前提
- `setup/voice` で、listen に見本音声が必要なときだけ同意と既定の voice を 1 つ整える
- `setup/voice` の完了後、そのまま候補の script で `listen` に入る
- `listen` で見本音声を生成または再利用し、見本確認をする
- `listen` ではお手本ボイスを先に聞き、3秒 / 5秒の巻き戻し・早送りと再生速度を使ってまねる練習ができる。provider 再生成や cache 変更はしない
- `review` では、まず総合スコア、今日の直すポイント、一言アドバイスを見て、必要な人だけ transcript / score grid / weak words / 比較を詳細表示で確認できる
- `/scripts/new` では、作成中の台本の word count / 1分目安 / chunk 数 / 長い塊や文 / 息継ぎポイントと、手動で直すための短い hint を表示する
- Script Studio は `/scripts/new` で AI draft を表示し、既定の mock provider で `ScriptBrief / mock ScriptDraft / quality report / freeze readiness` を確認できる。本格AI生成の品質確認ではなく、保存前に手動フォームで編集する
- Script Studio の generation contract は local helper としてあり、将来 AI が返した metrics / chunks / focusWords をそのまま信用せず、`englishScript` から quality report と freeze preflight を再計算する
- Script Studio の mock generator は provider boundary 経由で動き、UI は provider raw output ではなく pipeline result の accepted draft / rejected candidate を見る
- Script Studio の OpenAI adapter は server-side helper としてあり、Responses API の structured output を `ScriptGenerationCandidate` に変換して async pipeline に渡せる。client は直接触らず、server route 境界の内側で optional provider として扱う。保存にはまだ未接続
- `POST /api/script-studio/generate` は auth 必須の server-side 境界としてあり、`SCRIPT_GENERATION_PROVIDER=mock | openai` を選び、schema validation 後に pipeline result だけを返す。raw OpenAI response や secret は返さない
- `/scripts/new` の Script Studio panel から generation route を呼び、accepted draft / quality report / freeze preflight を preview できる。default は mock provider で、`この台本で練習開始` は未接続のまま
- `/scripts/new` の Script Studio accepted draft は、`title / English script / target seconds` だけを既存の手動 script 作成フォームへコピーできる。コピー後は編集してから既存保存 flow で保存する。freeze や voice generation ではない
- Script Studio の freeze / quota 設計では、generated draft は一時 preview、copied draft は editable form state、保存後の `scripts` row が当面の canonical。音声生成は将来の freeze 後だけにする方針
- `/scripts/new` の手動フォームでは、現在の台本から表示用の freeze preflight preview を見られる。これは保存・freeze・音声生成・quota 消費ではなく、将来の音声生成前チェックの目安
- `/scripts/[id]/listen` では、保存済み script を canonical とする read-only freeze candidate check を見られる。これは見本音声生成を止める gating ではなく、保存済み台本の確認表示
- MVP では `script_freezes` table はまだ作らず、freeze は当面 read-only preflight / 音声生成前の UX boundary として扱う。編集が必要な場合は in-place edit ではなく duplicate / new script を優先する
- 見本音声生成前の preflight design では、server 側で saved script を読み直し、cache reuse / regeneration / voice setup / provider / storage / quota の確認観点を整理している。まだ gating や API 追加はしない
- `/scripts/[id]/listen` では、音声生成前の preflight-only copy として、saved script から音声を作ること、cache reuse と regeneration の違い、voice setup / provider readiness が必要なことを確認できる。これは freeze 保存、quota 消費、生成 gating ではない
- `/scripts/[id]/listen` の preflight notice では、provider readiness / default voice / saved audio / cache behavior も既存状態から確認できる。cache hit は quota 消費ではなく、regeneration は将来 quota 対象になり得るが未実装
- Script Studio の quota event design では、text generation / voice generation / voice clone の quota 境界と、quota 消費にする操作・しない操作を整理している。初回実装は text generation の `script_generation_attempt`、続いて voice generation の `script_audio_generation_attempt` を non-blocking に記録するところまでで、billing / enforcement はまだない
- `/scripts/new` と `/scripts/[id]/listen` では、quota preflight copy only として、draft generation / regeneration や cache miss の音声生成は将来 quota 対象になり得る一方、copy / manual edit / saved script creation / cache hit / protected replay は quota 消費ではないことを表示する
- `quota_events` は event type / status / subject / target resource / idempotency / dedupe / privacy / RLS を持つ。Script Studio text generation と speakScript voice generation の write path は service 境界で non-blocking に接続済みだが、API response / enforcement / billing は変えていない
- Script Studio text generation の quota event write path は、`POST /api/script-studio/generate` の service 境界で non-blocking に接続済み。API contract / enforcement / billing はまだ変えていない
- Voice generation の quota event write path では、`/api/speak-script` から呼ばれる `speakScript` service 境界で cache hit / cache miss / provider synthesize / replay staging を non-blocking に記録する。API contract / cache key / enforcement / billing は変えていない
- Quota event implementation readiness design では、最初の write path は text generation から始め、voice generation はその後にする方針、write failure は当面 non-blocking、`rejected` は status ではなく `failed + failure_stage` で扱う方針を整理している。S5f では text generation だけ実装し、enforcement / billing はまだない
- Text generation quota event implementation plan では、`quota_events` migration 候補、RLS、write service interface、`generateScriptStudioDrafts` からの呼び出し位置、`billing_status`、write failure logging、privacy-safe metadata を実装前判断として具体化した
- Text generation quota event first implementation では、Script Studio の `script_generation_attempt` だけを `quota_events` に non-blocking で記録する。API response shape は変えず、raw prompt / raw seed text / generated draft text / raw provider response は保存しない。voice generation / enforcement / billing / usage dashboard はまだない
- S5f-db-smoke-plan では、dev DB に `0009_phase_s5_quota_events.sql` を適用した後の table / constraints / partial unique / RLS / mock provider smoke / privacy 確認手順を docs に固定している。secret 実値や手動ブラウザ確認は前提にしない
- S5k-plan では、dev DB に `0009/0010` を適用した後に text generation と voice generation の quota event write をまとめて確認する checklist と SQL query を docs に固定している。dev DB 操作や手動 smoke はまだ行わない
- Voice generation quota event connection では、`speakScript` service 境界で `script_audio_generation_attempt` を non-blocking に記録する。cache hit は `cache_hit / non_billable`、cache miss で provider synthesize に進む場合は `attempted -> succeeded/failed/partial` として扱う
- Quota events voice schema extension first implementation では、既存 `0009` は変更せず、後続 `0010` migration で voice 用の `event_type / category / status / failure_stage / subject / target` を広げ、DB types と quota write service の受け皿も追加した。dev DB apply、enforcement / billing はまだない。dev DB に `0009/0010` が未適用の環境では quota write warning が出る可能性があるが、write は non-blocking なので見本音声生成本体は止めない
- Audio Library は `script_audios` を pin する saved model audios と、`takes` を pin する saved best takes の curation layer。S6c で `script_saved_model_audios` / `script_saved_best_takes` の migration、DB types、`services/audio-library` skeleton を追加し、S6d/S6e で model audio と best take の list / save / label update or explicit slot replacement / unsave API を追加した。0011 適用後の API smoke では両 API の最小 flow、RLS spot check、metadata privacy、underlying data preservation を確認済み。S6f で listen の見本音声保存 / 保存解除 UI、S6g で review のベスト録音保存 / 保存解除 UI、S6h で progress の script-scoped Audio Library summary を追加し、S6i で保存導線の E2E smoke を確認した。cache / replay / quota_events の source of truth は変えていない
- speed / voice style の S7 design では、`playbackRate` を既存音声の聞く速さ、`target_speed / target_wpm / pause_density / voice_style_preset` を生成時の練習意図として分ける。S7b で local preset definition と provider mapper 境界を追加し、S7c で `natural / expressive / clear / slow` の copy と `slow -> slow-practice` 互換 alias、S7d で listen の生成 style / 再生速度 copy、S7f で listen の主操作優先、details 化、生成・保存操作の pending feedback、S7g で saved model audio metadata snapshot 表示、S7h で mock 前提の provider mapping boundary、S7i で `npm run voice:style-smoke` を整理済み。Script Studio は script 自体の話しやすさ、listen は生成 style と再生速度の違い、Audio Library は saved model audio の style / speed metadata snapshot を扱う方針
- `listen` / `record` では、保存済み script content から表示用の practice chunks を導出し、意味の塊ごとに見本確認と録音準備ができる
- `review` では、weak words が含まれる practice chunk を優先して「次に練習する塊」を出し、record / listen へ戻りやすくしている
- `listen` は voice 設定が不足しても、保存済み見本音声がある場合はそのまま確認を続けられる
- voice provider を差し替えるときも、canonical source は app-owned の `voice_consents / voices / script_audios` と protected replay route 側に残し、adapter は sample / consent / synthesize を provider request へ変換するだけに留める
- `record` で録音をアップロードし、文字起こし・評価・保存を行う
- Azure Speech pronunciation assessment は live manual smoke で `record -> evaluate -> review -> progress` が通り、review に score / weak words が保存されるところまで確認済み
- `review` で保存済み結果と保存済み録音を確認する
- `progress` で5本までの練習スロットを切り替え、最新結果、ベスト結果、保存済み録音を見る
- `scripts` と `progress` は、不足前提があるときに `voice 設定` や `listen` 側へ戻す launchpad として使える
- `scripts` は page 上部で `初回導線 / 再開導線` をまとめ、複製は card 側の補助導線に寄せている
- `scripts` の各 card では、一覧のまま `最新結果の要点` を確認してから `listen / record / 結果確認` を選べる
- `voice 設定` への導線は、候補 script が見えている場面ではその script の `listen` に戻るようにしている
- `scripts` と `progress` の候補 script は「推奨」ではなく、未着手や戻りやすさを優先して 1 本だけ出す入口候補
- `setup/voice` は `?next=` が internal path のときだけ保持し、blocked state から戻る補助に使う
- `listen` / `record` / `review` は script 単位の current step と `最新結果を見る` 補助導線を持ち、履歴途中からでも戻り先を決めやすい
- `listen` / `record` / `review` は page 上部でも、その script の `main loop` 上の位置と `listen / record / 最新結果` への戻り先を共通表示する
- 上の共通表示には `最新結果` の要点も載せ、戻り先を決めるためだけに毎回 review を開き直さなくてよい
- `progress` と detail 画面は `保存済み結果 / 最新結果 / 結果確認` の語彙をそろえ、読み替えを減らしている
- `progress` の `最新結果 / ベスト結果` card でも、detail と同じ要点 block で保存時刻・弱点語・coach nextStep を確認できる
- `review` でも `この結果 / 最新結果 / ベスト結果 / 次の一手` の読み方を progress に寄せ、detail を開いたときに比較と戻り先を一度で判断しやすくしている
- `progress` の `強み・弱点語・coach` と `最新とベストの差` も review と同じ比較軸へ寄せ、現在結果とベスト結果の読み替えを減らしている
- `record` は対応形式とサイズ上限を client 側でも先に案内し、unsupported / oversize の upload 前 recovery を優先する
- main loop 周辺の dynamic route と認証付き音声再生は、`listen / record / review` をまたいで route 起因の 404 や再生詰まりが出にくいようにそろえている
- `listen` は protected audio の準備完了後にプレーヤーを出すので、別タブ再生を踏まなくても初回から再生しやすい
- Playwright の最小 smoke では、`protected route guard`、`mock voice の setup/listen`、`listen blocked branch の provider_unavailable / consent_required / voice_required`、`provider_unavailable でも保存済み見本音声があれば listen を継続でき、audio 要素が playback-ready までロードできる分岐`、`mock listen 生成`、`mock 前提の record -> review -> progress` を崩さないことを見ている
- `npm run e2e:auth-guard` と `npm run e2e:setup-voice` で、guard と voice setup の current flow だけを短く回せる
- `npm run dev` は `.next-dev` を使い、`npm run build` は production 用の `.next` を使う。build 後も起動中 dev server の CSS chunk が消えにくい
- Playwright webServer は `PLAYWRIGHT_PORT` ごとの `.next-e2e-*` を使うので、手元の `next dev` や別ポートの test run と build output が競合しにくい
- `npm run home:css-smoke` は、起動中の `http://localhost:3000/` を直接開いて Home の root route / CSS chunk / nav spacing を確認する。人間のブラウザで見ている dev server と同じ port を見るための smoke

## route 名と画面の意味

- `/login`
  - login
- `/setup/voice`
  - voice 設定
  - 同意と必要な録音 upload を含めて、見本確認の前提を整える画面
- `/scripts`
  - scripts
  - 固定1分台本を選ぶ画面
- `/scripts/new`
  - 新規台本
  - 新規作成または script 複製をする画面
- `/scripts/[id]/listen`
  - listen
  - 見本確認をする画面
- `/scripts/[id]/record`
  - record
  - 録音準備と評価保存をする画面
- `/scripts/[id]/review/[takeId]`
  - review
  - 保存済み結果を確認する画面
- `/progress`
  - progress
  - 最新結果とベスト結果の差を振り返る画面
- `/settings`
  - settings
  - voice 設定や account deletion request / inventory dry-run / job dry-run / provider・storage・DB・Auth cleanup dry-run を確認する画面

README と UI では、route 名は `listen` / `record` / `review` / `progress` のように code で書き、役割説明は `見本確認` / `録音準備` / `結果確認` のように日本語で書き分けています。
画面内の `next` は存在する app page パターンだけを受け取り、安全でないときは `/scripts` などの route に戻します。login 完了後も、`/api/*` / `/_next/*` / `/auth/*` / replay API URL / 存在しない internal path は continuity に使わず、安全に `/scripts` へ fallback します。
`/scripts`、`/setup/voice`、`/progress`、`/settings` は page 内 redirect だけでなく middleware でも未ログインを止めます。magic link 送信時は Supabase へ素の `/auth/callback` を渡し、戻り先 continuity は短命 cookie で保持します。
sign-in / callback / sign-out と setup/voice 直後の auth 必須 API では、Supabase の cookie 変更を route response に反映し、client fetch も same-origin credentials 前提で送ります。
`/settings` には通常の logout 導線があります。Gate 0 smoke ではここから既存 session を切り、新しい magic link で `login -> callback -> /scripts` を確認します。
logout と成功した callback 後は login continuity cookie と PKCE verifier cookie を掃除します。callback 失敗時は、古い / 期限切れ link で次の pending login を壊さないよう PKCE verifier cookie は残し、login 画面で理由を分けて再試行させます。`next` は internal path のみ受け取り、既知 route prefix は小文字へ正規化します。
Gate 0 smoke で magic link を短時間に何度も送ると Supabase Auth の email rate limit に当たります。その場合は callback failure と混同せず、しばらく待ってから新しい link を発行します。UI は rate limit を raw detail なしの日本語 message として表示します。
`/auth/callback` と `/api/auth/*` は middleware の auth 初期化を通さず、PKCE verifier cookie と callback exchange の間に余計な auth 読み出しを挟みません。
callback failure は、`PKCE verifier cookie が callback に届いていない` 場合と、`cookie はあるが Supabase exchange 自体が失敗した` 場合を分けて扱います。server log の `Auth callback exchange failed` で切り分けます。
B1D1以前のCapacitor iOS historical preflightでは、magic link callbackがiOS WebViewではなくMac Chromeで開き、Chrome側にPKCE verifier cookieがなく`callback_pkce_missing`になりました。このsame-WebView/cookie経路は完成版に採用していません。B1D1ではlocal frontend、native callback、Keychain session、Bearer BFFへ分離しました。`server.url`はpreflight-onlyのままで、Store submission ready architectureとは扱いません。

## Capacitor iOS sync profiles

`capacitor.config.ts` は明示profileを必須にするため、rawな `npx cap sync ios` は使いません。

- B1C local bundle: `npm run mobile:sync:ios`
- B1D2 staging local bundle: `npm run mobile:sync:ios:staging`
- production local bundle検査: `npm run mobile:sync:ios:production`
- legacy hosted preflight: `npm run mobile:sync:ios:remote-dev`

B1C local-spikeは`server.url`、cleartext、localhost allowNavigationを含みません。Developer checkoutで行うlocalhost / cleartext / allowNavigationのauth smokeは別の開発専用経路で、local-spikeやproduction-ready構成として扱いません。Preview BFFを確認するときだけ、`MOBILE_BFF_BASE_URL=<preview-origin>`を同じコマンドへ一時的に渡せます。このoverrideはlocal-spike限定で、profile JSON、`.env`、commitへ保存しません。

B1D1では、local mobileのemail Magic Link + PKCE、device-only Keychain session、Bearer-only `GET /api/mobile/scripts`、read-only local `/scripts`を最小実装しました。通常署名SimulatorでMagic Link送受信、Debug callback、Bearer BFF、Keychain save/restore、再起動restore、logout、logout後の再起動までPASSしています。Debug callbackはcustom scheme限定で、production profileはUniversal Links / AASA / Associated Domainsが完了するまでrelease guardが意図的にFAILします。User A/B cross-user RLS proofとreviewer accountは後続gateです。詳細は[Phase B1D1 result](./docs/b1d1-mobile-auth-vertical-slice-result.md)を参照してください。

B1D2 Unit Aでは、Xcode `Staging` configuration、`com.nativeminutes.app.staging`、`staging` mobile/Capacitor profile、`https://native-minute-staging.vercel.app/mobile/auth/callback`を1対1に対応させました。Debug custom schemeはDebug専用Info plistに残し、Staging/ReleaseのInfo plistには含めません。Associated Domains、entitlement、AASA、Supabase HTTPS redirect、実機Universal LinkはUnit A時点では未実装でした。

B1D2 Unit C retryでは、Stagingだけに`App-Staging.entitlements`とexact `applinks:native-minute-staging.vercel.app`を追加し、`CODE_SIGN_ENTITLEMENTS`、Automatic signing、staging bundle ID、対象Developer TeamをStaging configurationへ限定しました。Apple Development certificate / private key、iPhone 14 Plus / iOS 26.2.1のwired接続、development profileを再確認し、実機destination向けsigned Staging buildが成功しました。artifactのstrict codesign、staging bundle / application identifier、exact Associated Domain 1件、embedded profile capability / device整合、Debug scheme非混入、production callback非有効化を確認したためUnit CはPASSです。Unit C commit `2c6a188`は`origin/codex/b1d2-unit-c`へ通常push済みです。

B1D2 Unit D1では、extensionなしの`public/.well-known/apple-app-site-association`を追加し、signed Unit C artifactで確認したApp ID Prefix由来のstaging application identifierと`/mobile/auth/callback`だけを`appIDs` + `components`形式で許可しました。Next.jsはredirect/rewriteを使わず、同pathへ`application/json`を直接付与します。local production serverでは200、no redirect、no cookie、valid/exact JSONをPASSしました。Unit D1 commit時点ではlive Vercel endpointは404で、deployとSupabase staging HTTPS redirectは未実施でした。

B1D2 Unit D2ではverified commit `b4cddb5`を`native-minute-staging`のProduction Branchへfast-forwardし、production AASAのHTTP 200、`application/json`、no redirect、exact staging application identifier、exact `/mobile/auth/callback`をPASSしました。`native-minute`側のProduction Branch `main`は変更していません。

B1D2 Unit Eでは、Supabase project `native-minute-staging`のRedirect URLsにexact `https://native-minute-staging.vercel.app/mobile/auth/callback`が追加済みであることを人間確認しました。Debug redirect `com.nativeminutes.app.debug://auth/callback**`は維持し、Site URLは`http://localhost:3000`、Magic Link templateはdefault、Custom SMTPは未設定、DB password rotationは未完了または不明です。callback/auth contractは変更しておらず、Unit FのMagic Link送信・実機install/launch・actual Universal Link smokeは未実施なのでB1D2はまだ未完了です。詳細は[Unit E result](./docs/b1d2-unit-e-supabase-redirect-result.md)を参照してください。

B1D2 Unit F3/F4では、actual warm Magic Linkがstaging appをforegroundにした後もJS callbackへ届かず`/login`に残る`WARM_UNIVERSAL_LINK_NATIVE_TO_JS_INGRESS_MISSING`を実証し、Capacitor 8.4.0公式templateどおり、非Scene構成の`AppDelegate`へ`continue userActivity`の`ApplicationDelegateProxy` forwardingだけを追加しました。native-to-JS contract tests、実機向けsigned Staging build、既存staging appへのupdate installをPASS後、修正版で新しいMagic Linkを1通だけ使い、warm OS handoff、native/Capacitor/plugin/JS ingress、callback validation、state/nonce/transaction binding、PKCE/session exchange、Keychain save、`/SCRIPTS`、Bearer BFFをPASSしました。terminate/relaunchでもKeychain sessionを復元し、callback再消費はありませんでした。prior ingress failureは解消済みですが、cold callback、logout、B1D2 final closeoutは未実施です。

Human Decisionにより、最初からrelease-wideだったoriginal B1D2を履歴を維持して`B1D2A_STAGING_AUTH_CORE`、`B1D2B_RELEASE_READINESS`、`B1D2C_DEFERRED_HARDENING`へrebaselineしました。original B1D2は`REBASELINED_SPLIT`、Aは`CLOSED_COMMITTED_PASS`、Bは`OPEN — APP_STORE_RELEASE_BLOCKER`、Cは`DEFERRED_WITH_OWNER_AND_REVIEW_GATE`で、AだけをPASSしてもoriginal全体をPASSとはしません。M01/M19/M20はHuman-provided historical actual-device evidenceをrepo実装/testsとの整合・contradiction不在の確認後、`PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE`として受理しました。これはrepo direct evidenceや今回のactual-device再実行ではなく、exact実行日時/buildは`UNKNOWN`のままです。case別provenanceは[Unit F safe evidence reconciliation result](./docs/b1d2-unit-f-safe-evidence-reconciliation-result.md)、exact mappingとevidence ledgerは[B1D2 rebaseline / split decision](./docs/b1d2-release-wide-scope-rebaseline-split.md)を参照してください。公式テンプレート100本の本文制作・翻訳・編集はExternal Workで行い、Native Minute mainline / Codexは後続Gateでinventory/schema/library/coverage/validation/import/display/performanceだけを担当します。

B1D2A remaining repo-only evidence batchでは、残19件をA〜Hへ再分類し、既存focused test 5 files / 75 testsを変更せず再実行してM06B/M07/M09/M12/M16/M18を`PASS_EXISTING_TEST_REEXECUTION`として閉じました。これはrepo-generated test evidenceでありactual-device evidenceではありません。B1D2Aは13件を残して`OPEN`です。source implementationはM04/M05/M14、actual-deviceはM03/M06A/M08/M24/M25、network/failure conditionはM13/M17/M22、exact repo proof不足の`UNKNOWN`はM10/M11です。source/test変更、Magic Link、iPhone/Simulator、external actionは行っていません。詳細は[B1D2A remaining repo-only evidence closeout result](./docs/b1d2a-remaining-repo-only-evidence-closeout-result.md)を参照してください。

B1D2A P0 repo-only negative/timeout waveでは、M10 wrong nonce/transactionとM11 required callback params欠落をprovider exchange前にfixed safe reasonで拒否するfocused proofを追加し、両件を`PASS_FOCUSED_REPO_PROOF`としました。M14はpersisted pending PKCE `expiresAt`を既存deadlineとしてSupabase exchange fetchへAbortSignalを渡し、stalled exchangeのbounded終了、既存new-link recovery、session/pending clear、same callback exchange最大1回を証明して`PASS_FOCUSED_REPO_FAULT_PROOF`としました。repo-generated proofでありactual-device proofではありません。B1D2Aは10件を残して`OPEN`です。詳細は[P0 repo-only negative / timeout wave result](./docs/b1d2a-p0-repo-only-negative-timeout-wave-result.md)を参照してください。

B1D2A M04/M05 safe Safari fallbackでは、exact AASA target `/mobile/auth/callback`にqueryを読まないfixed `303` entryを追加し、query-free `/mobile/auth/recovery`へ移すrecovery-only surfaceを実装しました。Web auth/Supabase middleware、provider exchange、Web session/Set-Cookie、Keychain、custom scheme自動遷移は使いません。後続承認でrequest-time runtimeのverified staging deploymentをfixed aliasへpromoteし、live callback 303、recovery 200、exact AASA、production isolationをPASSしました。M04は`IMPLEMENTED_LIVE_READY_PENDING_ACTUAL_DEVICE`、M05は`READY_PENDING_ACTUAL_DEVICE_AFTER_M04`で、actual-device最終PASSではありません。platform raw-query loggingは`UNKNOWN`です。詳細は[M04/M05 safe Safari fallback result](./docs/b1d2a-m04-m05-safe-safari-fallback-result.md)と[staging prerequisite remediation result](./docs/b1d2a-staging-prerequisite-remediation-result.md)を参照してください。

B1D2A consolidated actual-device / network waveでは、iPhone 14 Plus / iOS 26.2.1でM03 foreground delivery、M06A consumed-link retap、M13 offline-before-tapをPASSしました。M04/M05のlive deployment prerequisiteは後続promoteで解消済みです。M08はreal provider expiry待ち、M17はcontrolled refresh trigger不足です。M24/M25はWeb cookie session prerequisiteで一度STOPしましたが、後続Human Decisionで既存`https://native-minute-staging.vercel.app/mobile/auth/callback\?**`をquery-bearing mobile redirectTo用のauthorized entryとしてreconcileし、Debug + exact mobile + mobile queryの3件を不変のまま、exact Web callback `https://native-minute-staging.vercel.app/auth/callback?next=%2Fscripts`を1件だけ追加しました。Remediation Bは`WEB_STAGING_AUTH_CONFIGURATION_PREREQUISITE_RESOLVED_CONFIG_ONLY`です。M24は`READY_PENDING_WEB_COOKIE_AND_USER_AB_ACTUAL_PROOF`、M25は`READY_PENDING_WEB_COOKIE_MOBILE_BEARER_COEXISTENCE_PROOF`で、actual proofのPASSではありません。B1D2AはM22を含む7件を残して`OPEN`です。case別provenanceは[consolidated actual-device / network wave result](./docs/b1d2a-consolidated-actual-device-network-wave-result.md)と[staging prerequisite remediation result](./docs/b1d2a-staging-prerequisite-remediation-result.md)を参照してください。

後続のM24/M25 combined actual proofでは、初回User A Web `/scripts`のserver-side exception（safe digest `182509400`）で一度STOPしました。read-only diagnosticで`JWT issued at future`とcallback exchange/cookie persistence/auth resolution成功まで切り分け、承認済みの既存cookie 1回reloadは正常表示になりました。そのまま通常Web UIでUser A owned scriptを作成し、Web cookieとMobile Bearer/Keychainの同時維持、Mobile-only logout後のWeb cookie維持を確認してM25を`PASS_LIVE_WEB_COOKIE_MOBILE_BEARER_COEXISTENCE`としました。Mobile User Aではresourceが表示され、正常認証/BFFのUser Bでは非表示だったため、repo owner filter/RLSのcorroborationと合わせてM24を`PASS_ACTUAL_STAGING_USER_AB_ISOLATION`としました。actual-deviceはHuman-reported current resultで、Web/runtime/repo evidenceとはprovenanceを分離しています。B1D2A残件は5件（M04/M05/M08/M17/M22）です。詳細は[M24/M25 combined actual proof result](./docs/b1d2a-m24-m25-combined-actual-proof-result.md)を参照してください。

M04/M05 actual-device fallback closeoutでは、iPhone 14 Plus / iOS 26.2.1でMobile用fresh Link Aを通常Staging `/LOGIN`から発行後、未開封のままappをuninstallしてbundle不在を確認しました。Link Aの1回tapはSafari safe recoveryを表示し、app起動、認証成功、秘密値表示、custom scheme遷移、crashがないためM04を`PASS_ACTUAL_DEVICE_SAFE_SAFARI_FALLBACK`としました。必要な1回だけcurrent Staging configurationでsigned artifactをtemporary buildし、staging identity/domainと`authConfigured=true`を検証しました。同じartifactを再buildせずinstallし、Link Aを再利用せずfresh Link Bを1回tapしてnative `/SCRIPTS`とBearer BFF、callback failure/duplicate/crashなしを確認したため、M05を`PASS_ACTUAL_DEVICE_FRESH_LINK_AFTER_INSTALL`としました。source/config/signing/productionは変更していません。actual-device/live/repo evidenceはprovenanceを分離し、platform raw-query loggingは`UNKNOWN`のままです。B1D2A残件は3件（M08/M17/M22）です。詳細は[M04/M05 actual-device fallback closeout result](./docs/b1d2a-m04-m05-actual-device-fallback-closeout-result.md)を参照してください。

M22 clean-install actual-behavior proofでは、AASAを除いたisolated Previewとexact `?mode=developer` entitlementのtemporary signed artifactを使い、iPhone 14 Plus / iOS 26.2.1で通常Staging appを完全uninstallしてbundle不在確認後にclean installしました。project-scoped Protection一時disable後のPreviewはAASA 404、callback 303、recovery 200、Set-Cookie 0で、`swcd`もDeveloper Modeと`.wk` acquisition taskを記録しました。Notes上のsecret-free callbackを1回tapするとNative appは自動起動せずSafari safe recoveryとなり、custom scheme fallback、unexpected auth、`/SCRIPTS`、crashなしだったため、M22を`PASS_CONTROLLED_ISOLATED_AD_REAL_FAILURE_PROOF`としました。Diagnostics UIはV2で再実行せずactual routingを主証拠としています。Protectionは593秒で復元し、temporary appを除去、normal Staging appを再installしました。fixed staging callbackのNotes tapはNative appを開き`/LOGIN`を維持し、AASA/CDN/callback/recovery/production isolationも復旧済みです。B1D2A残件は2件（M08/M17）で、自動進行しません。詳細は[M22 clean-install actual-behavior proof result](./docs/b1d2a-m22-clean-install-actual-behavior-proof-result.md)を参照してください。

M08 real-provider natural-expiry proof V1では、通常Staging `/LOGIN`から認証linkのsendを1回だけ試行しましたがrate limitとなり、Link E発行は確認できませんでした。再送、link open、自然失効待ち、expired tap、provider設定変更、M17は実行していません。current Dashboard sessionはsigned outだったためexpiry値を新規確認したとはせず、last-known read-only値3600秒を保持します。M08は`PENDING_RATE_LIMIT`のまま、B1D2A残件は2件（M08/M17）で変わりません。詳細は[M08 real-provider natural-expiry proof result](./docs/b1d2a-m08-real-provider-natural-expiry-proof-result.md)を参照してください。

M08 target alignment / natural-expiry closeoutでは、M22 recovery build時の一時的なWeb-to-Mobile env転用がinstall済みartifactのSupabase target mismatch原因と判明しました。tracked source/configを変えず、current `native-minute-staging`のpublic client設定だけでsigned Staging artifactをbuildし、exact staging identity/domain/project、`authConfigured=true`、secret/service-role非混入を確認してiPhone 14 Plus / iOS 26.2.1へinstallしました。expiry 3600秒のfresh Link Eを1通発行し、未開封のまま自然失効後に1回だけtapした結果、native `/LOGIN`で新しいlink取得を案内し、session、`/SCRIPTS`、authenticated Bearer success、retry、crashはありませんでした。BFF接続表示はpublic healthです。M08を`PASS_ACTUAL_DEVICE_EXPIRED_PROVIDER_LINK`とし、B1D2A残件はM17の1件です。actual-deviceとrepo/build/live/config evidenceは分離し、M17へ自動進行しません。詳細は[M08 real-provider natural-expiry proof result](./docs/b1d2a-m08-real-provider-natural-expiry-proof-result.md)を参照してください。

M17 final natural-refresh proofでは、fresh Link Fの1回tapでiPhone 14 Plus / iOS 26.2.1のnative `/SCRIPTS`、owned script 1件、Bearer BFF、error/crashなしを確認しました。現行sourceはexpiry 60秒前のforeground refresh、BFF `session_expired`時の1回refresh/retry、retryable failure時のauthenticated/Keychain保持、foreground再試行、single-flightを行います。current access-token expiry 3600秒とlogin成功観測から、refresh windowは遅くとも`2026-08-12 20:02:38 JST`、安全な再開時刻は`20:05 JST`です。raw token/Keychainは読まず、appはforce-quitせずbackgroundです。M17は`READY_PENDING_NATURAL_REFRESH_WINDOW`でactual outage/recovery未実施、B1D2A残件はM17の1件です。詳細は[M17 final natural-refresh proof result](./docs/b1d2a-m17-final-natural-refresh-proof-result.md)を参照してください。

20:05以降のM17 actual proofでは、app background中に機内モードON / Wi-Fi OFFとしてforegroundし、15秒超後もnative `/SCRIPTS`とlogout actionを維持、scripts loading / offline表示、`/LOGIN`/crash/manual retryなしを確認しました。network復旧後のforegroundではowned script 1件とBearer BFFが自動復旧しました。original tokenは3600秒設定上すでにexpiredしているため、このBearer successはnatural refresh recoveryのactual evidenceです。M17を`PASS_ACTUAL_DEVICE_TRANSIENT_REFRESH_RECOVERY`とし、B1D2A case-level残件は0です。ただしA全体はfinal closeout audit前なのでまだ`OPEN`で、次は別承認の`B1D2A_FINAL_CLOSEOUT_AUDIT`です。B1D2B/Gate 2へ自動進行しません。

B1D2A final closeout auditでは、staging側D1-D9/D13/D15とM01-M20/M22/M24/M25を統合監査し、24 caseすべてPASS-class、OPEN/PENDING/UNKNOWN 0、P0/P1 0を確認しました。Human safe evidence、repo proof、actual-device/live staging、controlled network、natural expiry/refresh、isolated development-mode failureのprovenanceはcase単位で分離しています。current Staging target、AASA/CDN/callback/recovery、production isolation、release/auth guards、145 mobile tests、typecheck/lint/buildもPASSし、`B1D2A=CLOSED_COMMITTED_PASS`（`closedAt=2026-08-12T20:29:29+09:00`）としました。original B1D2、B1D2B、B1D2Cのstatusは上記のままです。統合結果は[B1D2A final closeout audit result](./docs/b1d2a-final-closeout-audit-result.md)を参照してください。Gate 2とExternal Template Workは開始していません。

Mobile AuthのDebug live buildは、public client設定の`MOBILE_SUPABASE_URL`と`MOBILE_SUPABASE_PUBLISHABLE_KEY`をbuild commandへ一時的に渡す契約です。値を`.env.local`、profile JSON、source、docsへ保存しません。secret/service-role keyとlegacy JWT keyは拒否し、`sb_publishable_`形式だけを許可します。dynamic transaction queryを持つDebug redirectのDashboard許可patternはpath限定の`com.nativeminutes.app.debug://auth/callback**`で、scheme全体を許可しません。

### iOS Simulator runtime signing boundary

compile-onlyのSimulator xcodebuildと、Keychainへ到達するruntime smokeは別のgateです。compile-only成果物は必要に応じて署名を省略できますが、その`.app`をinstall / launchしてKeychain runtime smokeに使ってはいけません。

runtime smokeでは通常のSimulator署名でbuildし、install前に次を実行します。

```bash
npm run check:ios-simulator-runtime-signing -- --app /absolute/path/to/App.app
npm run ios:simulator:runtime-smoke -- --app /absolute/path/to/App.app --device booted
```

runtime guardは`CODE_SIGNING_ALLOWED=NO`または`CODE_SIGNING_REQUIRED=NO`（同等のfalse値を含む）をinspection前に拒否します。bundleのstrict codesign、Simulator用`application-identifier`、Keychain利用条件を確認してからだけinstall / launchします。現在のKeychain pluginはcustom access groupを指定しないため、明示的な`keychain-access-groups`がない通常Simulator buildもdefault access groupでvalidです。Simulator eraseやKeychain itemの手動削除は前提にしません。

directな`simctl install` / `simctl launch`は、同checkerをPASSした`.app`に対する診断以外ではB1D1 runtime smoke手順として扱いません。checker自体のregressionは`npm run check:ios-simulator-runtime-signing:self-test`で確認します。

## main loop

1. `login` する
2. 必要なときだけ `/setup/voice` で同意と既定の voice を整える
3. `/scripts` で固定1分台本を作る
4. `/scripts/[id]/listen` で見本音声を生成または再利用し、見本確認をする
5. `/scripts/[id]/record` で録音をアップロードし、評価して保存する
6. `/scripts/[id]/review/[takeId]` で保存済み結果を確認する
7. `/progress` で5本までの練習スロットから成果を見る

Mobile Gate 3のcanonical learning loopは`CLOSED_COMMITTED_PASS`です。source `b93ea20d9e04486bf9f7cbe614f78fb8edf35d67`を固定stagingへ載せ、iPhone 14 Plus / iOS 26.2.1でElevenLabs Listen/cache、16 kHz mono/16-bit WAV録音、OpenAI transcription、Azure pronunciation、persisted Review、3 intentional Takesのcanonical Progress、offline/reconnect、logout/relaunchを確認しました。これはcurrent Mobile UIをfinal product shellとして承認するものではなく、official 100-template library、final script selection、rich Listen/Review/Progress、fresh-user Mobile voice setupなどは後続gateです。pre-remediation silent audioの原因は`UNKNOWN`のままです。詳細は[Gate 3 Mobile main-loop final result](./docs/g3-mobile-main-loop-final-result.md)を参照してください。なお、これはStore-release provider-readiness Gate 3のhistorical `WARN`とは別の実装gateです。

Gate 4 provider freezeは`CLOSED_COMMITTED_PASS`です。implementation source `b6663a7b21a190779fd3d9facfd6c5efc8abaeeb`のexact signed Staging artifactによるfresh-user consent/sample/ElevenLabs clone/default、通常のListen cache replay、保護音声再生、normal TakeのOpenAI transcription / Azure evaluation / persisted Review証拠を保持します。historical closeout `7b24e41af8b55eac5bc96058aff8ed3c920cc86b`後に発見されたMobile cache-ordering P1はremediation `3e073eb1f60233dcc458651b52e745573ae051c6`で解消し、independent final read-only re-auditは`FINAL_REAUDIT_PASS`、Human Decisionで受理済みです。focused Mobile proofはprovider unavailableでもowned cache hitを`200`・synthesis 0・safe responseで返し、cache missはsafe `503`・provider detail非露出・mock fallback 0を確認しています。P0=0、P1=0、P2=2（Yahoo Mail fallback、cross-instance clone idempotency）、cost/usage observabilityは`PASS_WITH_LIMITATION`です。provider-unavailable実機fault injectionは共有Staging kill switchしかないため`NOT_RUN_SAFE_LIMITATION`のままです。destructive provider/account deletionはGate 5のHuman-authorized workであり、Gate 5へ自動進行しません。[Gate 4 fresh-user voice readiness result](./docs/g4-provider-production-freeze-fresh-user-voice-readiness-v2-result.md)を参照してください。

## 操作画面の方針

主要画面は、説明より操作を先に見せます。Home は Practice / Progress への入口、Practice は5本までの練習スロット選択、Progress は成果確認です。setup/voice は自分の声の登録と再アップロードに絞り、provider/debug 詳細は主導線から外します。listen は単一の hidden audio element で protected replay URL を直接再生し、見えている音声操作は下部固定 audio bar に一本化します。record はマイク録音と評価操作を中心にします。主要ボタンは押下、処理中、disabled が分かる表示に寄せています。

## mock と実装済みの境界

### 本接続でも維持する前提

- voice の app flow は `consent -> voices -> default voice -> script_audios`
- `provider_voice_id` は provider 呼び出し用で、ownership や cache key の基準にはしない
- `script_audios` の cache key は `provider + 保存済み voice row id + server-owned script locale/content`
- provider bytes は `speakScript` 側で app-owned replay 参照に正規化してから保存する
- `script_audios.storage_path` は listen が認証付きで再生する app-owned 実体参照として使う
- app-owned storage は `voice-consents / voice-samples / script-audios` に分け、provider adapter はそこから server-side に読む
- replay route は `script_audios.storage_path` から owned な見本音声実体を読み出して返す
- app-owned 見本音声 bytes の保存先は、専用 bucket `script-audios` を使う Supabase Storage が本線
- object key は `<userId>/<scriptId>/<voiceId>/<cacheKey>.<ext>` を本線にする
- 最低限の metadata は `storageBucket / storageObjectKey / contentType / byteLength`
- その metadata は `script_audios.stored_asset` に保持する
- storage policy は public にせず、replay route から authenticated route client で server-side download する
- policy 側は bucket と user prefix の coarse 制御に留め、script/voice/cache の owned 整合は app 側の `script_audios` lookup で担保する
- listen / progress / review が読む結果や replay 導線の canonical source は server 側の保存データ

### mock 前提で仮置きの部分

- v1 mainline の voice provider は `VOICE_PROVIDER=elevenlabs`。`ELEVENLABS_API_KEY` と `SUPABASE_SERVICE_ROLE_KEY` がそろっていれば current contract 上で `createVoice / synthesize` を使える。`VOICE_PROVIDER=mock` は開発 fallback として維持する。OpenAI voice は entitlement-sensitive な追加確認 provider で、普段の practice mainline には出さない
- mock でも `stageScriptAudioForReplay` は短い wav を `script-audios` bucket に保存し、`/api/script-audio/[audioId]` は `stored_asset` から server-side download して返す
- `provider.synthesize` の出力は `stageScriptAudioForReplay` で正規化し、`inline-bytes` / `temporary-url` / `mock-replay-path` の 3 形を受けられるようにしている
- `temporary-url` の generic server-side fetch はまだ入れていない。許可 host と fetch 方針を固定しないまま replay service から外部 URL を取りに行かない方針にしている
- mock 前提でまだ仮置きなのは `sampleAudioPath` fallback、provider-side consent endpoint の差分、verification pending の扱い、provider failure copy の細部で、canonical な app flow 自体は変えない
- `setup/voice` / `listen` / `progress` は current `VOICE_PROVIDER` に一致する consent / default voice / script audio だけを読む。別 provider の保存済み state は自動再利用しない
- 実 provider adapter が返す最小情報は `providerRequestId` と `audioSource`。`playbackPath` は任意で、無ければ app replay path を service 側で導出する
- content type の正規化は provider adapter helper 側で先に行い、replay service は正規化済み `audioSource` を app-owned storage に載せる
- 最初の実 provider adapter は `inline-bytes` を本線にする。`temporary-url` は追加の server-side fetch 実装が必要なので次段階に残す
- helper に最低限渡すのは `providerRequestId / bytesBase64 / contentType`。`contentType` が generic すぎると拡張子と replay header が弱くなる
- entitlement 待ちの OpenAI voice を深追いせず、repo-side 本線は ElevenLabs IVC に寄せる
- OpenAI は v1 mainline では transcription / Script Studio generation / coaching 側で使う。voice provider として試す場合も、provider adapter 側に閉じ、UI では普段の主導線へ出さない
- consent recording は `/api/uploads/voice-consent` で先に `voice-consents` bucket へ保存し、`/api/voice-consent` は `accepted` に加えて `name / language / recording` を受けられる
- `setup/voice` と voice service は provider 名の直書きではなく、factory が返す `provider requirements` を主に見て UI と validation を分ける。provider 固有の upload / multipart / entitlement detail は provider adapter 側へ寄せる
- `providers/voice/elevenlabs.ts` は `createVoice / synthesize` の real adapter を入れ始めており、app-owned sample audio を `/v1/voices/add` に渡し、TTS bytes を `inline-bytes` へ戻す
- current repo の ElevenLabs synthesize は `output_format=mp3_44100_128` を使い、返った bytes を app-owned replay に保存して listen へ返す
- ElevenLabs の見本音声生成では `natural / expressive / clear / slow` の voice style preset を `voice_settings` に変換する。preset は `script_audios.cache_key` にも含め、style ごとの保存済み音声を混ぜない
- ElevenLabs では provider-side consent endpoint を current repo に無理やり持ち込まず、`createConsent` は app 内同意ステップを保つ local acknowledgment として扱う
- ElevenLabs voice clone が verification required で返る場合、current repo は pending verification voice を保存しないので fail-fast して再試行を促す
- `setup/voice` は、普段は同意 / voice 作成 / listen への復帰を先に見せ、provider diagnostics や manual smoke は details 側で確認できる
- setup/voice の Provider readiness では、provider-side consent の有無、`inline-bytes` 本線、verification pending の fail-fast 方針まで確認できるが、普段の practice first view には出しすぎない
- ElevenLabs を初回確認するときは、`setup/voice` の `Manual smoke checklist` に沿って `sample upload -> voice clone 1 回 -> failure point 確認 -> 通れば protected replay 経由で listen の TTS を 1 回` の順で進める
- 実 provider manual smoke の前に `npm run voice:preflight` を使うと、現在の `VOICE_PROVIDER` と必要 env の不足だけを先に切り分けられる。style mapping 境界だけを確認するときは `npm run voice:style-smoke` を使う
- OpenAI voice endpoint が `Your organization does not have access to this endpoint.` で失敗する場合は、auth/upload バグではなく entitlement 不足として扱う。server log に detail を残し、UI では `VOICE_PROVIDER=mock` に戻すか entitlement 付与後に再開する判断を出す
- manual smoke では OpenAI voice の provider-side consent 登録段階から entitlement 不足らしい失敗に到達しており、current repo ではここから先を entitlement 依存として扱う
- entitlement が無い環境で開発を止めない最小手順は、`.env.local` で `VOICE_PROVIDER=mock` に戻して開発サーバーを再起動し、`/setup/voice` から mock voice を作成し直すこと
- voice 作成で手入力 path を使う場合も、受けるのは app-owned な `storage://voice-samples/...` 参照だけで、`mock://...` や別 bucket の stale path は早めに止める
- sample audio は `createVoice` に直送せず、先に `/api/uploads/voice-sample` で app-owned に保存してから `createVoice` に参照を渡す
- `voice-samples` bucket を追加し、object key は `userId/consentId/uuid.ext` で owned upload を見やすくしている
- `createVoiceRequestInput` は `sampleAudio?: { audioPath: string; contentType?: string; byteLength?: number }` を本線にし、旧 `sampleAudioPath` は段階的な fallback にする
- `sample_audio_path` は当面、upload 済み sample の `audioPath` か旧 fallback path を保存する互換カラムとして使う
- temp file / in-memory だけで持つ案は、persisted cache と protected replay をまたぐ本線にはしない

### 実装済み

- Provider kill switch は `NATIVE_MINUTE_DISABLE_OPENAI`、`NATIVE_MINUTE_DISABLE_AZURE`、`NATIVE_MINUTE_DISABLE_ELEVENLABS`、`NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS` で扱う。Storage upload は Gate 4j 以降、`NATIVE_MINUTE_DISABLE_STORAGE_UPLOAD` も同じ停止 alias として受ける。production env / dashboard の実変更と operation proof は人間確認で行い、secret や env value は記録しない。

- Supabase Auth / DB / Storage を使った login と保存
- script 作成、複製、削除
- `recordings` bucket への録音 upload
- `review` での保存済み結果表示
- 認証付き `/api/takes/[takeId]/audio` を使った保存済み録音再生
- `script_audios` の cache reuse
- `record -> upload -> transcription -> evaluate -> save` の main path
- `persist_review_bundle` を使った atomic な review 保存

### mock 寄り

- voice provider
  - 既定は mock
- pronunciation evaluator
  - 開発 fallback は mock
  - `PRONUNCIATION_PROVIDER=azure` は `AZURE_SPEECH_KEY / AZURE_SPEECH_REGION` があれば repo-side で接続でき、live manual smoke も通っている
  - current repo の Azure evaluator は PCM wav を前提にし、browser 録音や非 wav file は client 側で正規化できるときだけ wav/PCM へ変換してから upload する
  - Azure 未設定や接続失敗時は `record` / `progress` の recovery 導線で `listen` や `scripts` に戻し、開発継続は `PRONUNCIATION_PROVIDER=mock` を本線にする
- `setup/voice`
  - 実 voice cloning ではなく MVP 用の voice 設定 UI
- `listen`
  - mock voice では認証付き route 経由の見本音声を再生

### 条件付きで実動作

- transcription
  - `TRANSCRIPTION_PROVIDER=openai` のときだけ実 transcription
  - `TRANSCRIPTION_PROVIDER=mock` では開発用の補助 transcript が必要

## データと整合の前提

- canonical source は server 側
  - `scriptText` など client 値を canonical source にしない
- `/api/evaluate` は audio-first
  - `audioPath` または `audioStorageKey` が前提
- review 保存は `persist_review_bundle` 経由で atomic
- `recordings` は owned な `user_id/script_id/...` key に閉じる
- `script_audios` は `provider + 保存済み voice row id + script locale + script content` の cache key を使う
- `takes` は script 全文 snapshot を持たない
  - そのため script の in-place edit は軽く入れず、必要なら duplication を優先する

## setup

1. `.env.example` を `.env.local` にコピーする
2. 次を設定する
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL`
3. 必要に応じて provider env を設定する
   - Web production / production-like check は `npm run production:preflight` を実行する
   - production guard は `VERCEL_ENV=production`、`NATIVE_MINUTE_ENV=production`、または `NATIVE_MINUTE_PRODUCTION_GUARD=1` で有効になる
   - production では `VOICE_PROVIDER=elevenlabs`、`TRANSCRIPTION_PROVIDER=openai`、`PRONUNCIATION_PROVIDER=azure`、`SCRIPT_GENERATION_PROVIDER=openai` を要求し、mock provider と `E2E_TEST_*` env は blocked にする
   - Supabase / Storage / RLS の production 前確認は [docs/gate1b-supabase-storage-rls-runbook.md](./docs/gate1b-supabase-storage-rls-runbook.md) に従い、non-destructive checker として `npm run supabase:storage-rls:check` を使う
   - `VOICE_PROVIDER=mock`
   - `VOICE_PROVIDER=elevenlabs` (v1 mainline の voice provider)
   - `VOICE_PROVIDER=openai` (v1 mainline では使わない experimental voice provider)
   - `SCRIPT_GENERATION_PROVIDER=mock`
   - `SCRIPT_GENERATION_PROVIDER=openai` (Script Studio live smoke 時だけ)
   - `TRANSCRIPTION_PROVIDER=mock`
   - `TRANSCRIPTION_PROVIDER=openai`
   - `PRONUNCIATION_PROVIDER=mock`
   - `PRONUNCIATION_PROVIDER=azure`
   - `OPENAI_API_KEY` (`SCRIPT_GENERATION_PROVIDER=openai` / OpenAI transcription の live use 時だけ。OpenAI voice は v1 mainline ではない)
   - `OPENAI_VOICE_MODEL=gpt-4o-mini-tts` (任意)
   - `ELEVENLABS_API_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ELEVENLABS_TTS_MODEL_ID` (任意)
   - `OPENAI_SCRIPT_GENERATION_MODEL=gpt-4.1-mini` (任意)
   - `OPENAI_TRANSCRIPTION_MODEL=whisper-1`
4. 依存を入れる
   - `npm install`
5. migration を順に適用する
   - `0001_init.sql`
   - `0002_phase1_hardening.sql`
   - `0003_phase25_hardening.sql`
   - `0004_phase25_storage_guards.sql`
   - `0005_phase5_recordings_storage.sql`
   - `0006_phase6_script_audio_storage.sql`
   - `0007_phase7_voice_sample_storage.sql`
   - `0008_phase8_voice_consent_storage.sql`
6. 開発サーバーを起動する
   - `npm run dev`

## 手動確認の最短手順

### mock 寄りで main loop を見る

1. `login` する
2. `/setup/voice` で同意と既定の voice を作る
3. `/scripts` で script を 1 つ作る
4. `/scripts` で `listen` から始める script を決める
5. `/scripts/[id]/listen` でお手本ボイスを聞き、区切りを見ながらまねる
6. 声や評価の準備が不足しているときは、その場の案内から `voice 設定` や `scripts` に戻る
7. `/scripts/[id]/record` で録音を作り、評価して保存する
8. `/scripts/[id]/review/[takeId]` で保存済み結果と保存済み録音を確認する
9. `/progress` で5本までの練習スロットから成果を見る

### 実 transcription を通す

1. `TRANSCRIPTION_PROVIDER=openai` にする
2. `OPENAI_API_KEY` を設定する
3. 30〜60秒程度のはっきりした英語音声を用意する。個人音声や秘密を含むファイルは repo に残さない
4. まず `PRONUNCIATION_PROVIDER=mock` で `/scripts/[id]/record` から補助 transcript なしで保存できることを確認する
5. 必要なら `PRONUNCIATION_PROVIDER=azure` に切り替え、同じ main loop が通ることを確認する

### Azure pronunciation evaluator を通す

1. `PRONUNCIATION_PROVIDER=azure` にする
2. `AZURE_SPEECH_KEY` と `AZURE_SPEECH_REGION` を設定する
3. 必要なら `npm run pronunciation:preflight` で repo-side readiness を確認する
4. `TRANSCRIPTION_PROVIDER=mock` のままなら補助 transcript を入れる
5. `/scripts/[id]/record` では browser 録音または wav / PCM ファイルで保存する
6. browser 側で自動正規化できないときだけ wav / PCM ファイルを選び直す
7. `review` と `progress` で Azure 由来の score / weak words / coach が保存されることを確認する

### browser microphone で OpenAI transcription + Azure を通す

S12e では、この human microphone smoke は通過済みです。別環境で再確認する場合は以下を使います。

1. `TRANSCRIPTION_PROVIDER=openai` と `PRONUNCIATION_PROVIDER=azure` にする
2. `OPENAI_API_KEY`、`AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION` を設定する
3. `npm run pronunciation:preflight` で必要 env が set であることだけ確認する
4. `/scripts/[id]/record` で `マイクで録音する` を使い、30〜60秒程度のはっきりした英語を録音する
5. Azure 選択時は browser 録音が webm でも upload 前に wav / PCM へ正規化される。変換できない場合は wav / PCM ファイルを選び直す
6. `評価して保存する` から `/scripts/[id]/review/[takeId]` へ進み、transcript / score grid / weak words を確認する
7. `/progress` に latest result と review link が反映されることを確認する

### 本番前 manual QA / targeted failure smoke

詳細は [docs/provider-readiness-plan.md](./docs/provider-readiness-plan.md) の `S13a 本番前 Manual QA Checklist` を使います。

- happy path は `/scripts/new -> listen -> record -> review -> progress` と、同じ script の 2 回目練習まで見る
- desktop / mobile 幅、refresh / back navigation、secret / raw provider response が画面に出ていないことを spot check する
- S13b の優先 failure smoke は `empty transcript / too short`、`OpenAI env missing`、`Azure env missing`
- S13c の結果記録テンプレートに、provider 設定、録音時間、failure phase、secret を貼らない注意を残す
- rate limit / billing / browser wav normalization / review save failure は、環境依存や人間確認が大きいので後続で扱う

### 実 voice provider smoke の前に見る

1. [docs/voice-provider-smoke-plan.md](./docs/voice-provider-smoke-plan.md) を読む
2. `npm run voice:style-smoke` を実行する
3. 対象 provider の env を設定した後、`npm run voice:preflight` を実行する
4. repo 状態だけを見ると、最初の実 provider smoke は ElevenLabs が自然
5. OpenAI voice は entitlement-sensitive な追加確認 provider なので、endpoint access 失敗を repo bug と混同しない
6. 失敗時は `.env.local` を `VOICE_PROVIDER=mock` に戻し、dev server を再起動する

## 最小スモーク

- lint
  - `npm run check:workspace`
  - `npm run lint`
- build
  - `npm run build`
- typecheck
  - `npm run typecheck`
- tracked auth artifact gate
  - `npm run check:auth-artifacts`
- voice style mapping smoke
  - `npm run voice:style-smoke`

Playwright は最小スモークを維持していますが、E2E 拡張は主目的にしていません。認証setupと未認証route guardではtrace / video / screenshotをデフォルトで残さず、storage stateと認証projectの出力はOSの一時領域だけに置いて実行終了時に削除します。秘密値、認証URL、cookie、storage stateをログ・画像・報告へ貼り付けないでください。

## 現在の制約

- voice provider は mock fallback を維持しつつ、ElevenLabs はユーザー実ブラウザで clone voice 作成と script TTS まで成功済み
- Script Studio generation preview、listen の preflight-only UX copy、provider/cache UI refinement、quota event design は追加済みだが、freeze 保存 / quota enforcement / voice generation gating には未接続
- OpenAI voice は entitlement 待ちのため、失敗時の安全な fallback は引き続き mock
- pronunciation evaluator は mock fallback を残しつつ、Azure は local WAV と OpenAI transcription 併用の人間マイク録音で live smoke 済み
- transcription が実動作するのは `TRANSCRIPTION_PROVIDER=openai` のときだけ
- Azure evaluator は `AZURE_SPEECH_KEY / AZURE_SPEECH_REGION` を前提にする
- current repo の Azure evaluator は PCM wav を前提にし、browser 録音や非 wav file は client 側で正規化できるときだけ wav / PCM へ変換する
- `review` と `progress` は現在の script 本文を表示しており、`takes` に当時の script snapshot はない
- 署名付き再生 URL は使っていない
- login 完了後の continuity は存在する app page パターンだけを通す。path が無い・不正なときや replay API URL は `/scripts` に fallback する
- `/login` では `next` が有効・無効・未指定のどれかを UI 上で短く表示し、送信後メッセージも同じ戻り先を案内する
- Azure evaluator と OpenAI transcription の real-provider loop は local WAV と人間マイク録音で通過済み。ただし別環境の Azure key/resource 状態と browser 側 decode 可否は環境依存で再確認が必要

## よくある失敗

- Supabase env が足りない
  - `Supabase の環境変数が未設定です。`
- `OPENAI_API_KEY` が足りない状態で `TRANSCRIPTION_PROVIDER=openai`
  - `record` 側で `Recovery plan` が出て、`listen` か `scripts` に戻せる
- `0005_phase5_recordings_storage.sql` が未適用
  - `recordings バケットが見つかりません。`
- storage policy がずれている
  - upload / download が権限エラーになる
- `VOICE_PROVIDER=openai` なのに `SUPABASE_SERVICE_ROLE_KEY` が無い
  - `setup/voice` が blocked になる
- `PRONUNCIATION_PROVIDER=azure` なのに `AZURE_SPEECH_KEY` または `AZURE_SPEECH_REGION` が無い
  - `record` 側で evaluation provider が blocked になる
- Azure evaluator で browser 側の wav 正規化に失敗する
  - `record` 側で wav / PCM への差し替え案内が出る
- ローカル変更後に画面が変わらない
  - `npm run dev` を再起動する

## 補足

- `docs/current-state.md`
  - いまの実装状態と残課題の短い要約
- `AGENTS.md`
  - Codex に守らせる前提と作業方針
