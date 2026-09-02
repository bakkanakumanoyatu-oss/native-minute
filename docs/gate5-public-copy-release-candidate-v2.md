# Gate 5 公開文言 Release Candidate V2

記録日: 2026-09-02

Status: `RELEASE_CANDIDATE / DO_NOT_PUBLISH_YET`

この文書は、Native Minuteのプライバシーポリシー、アカウント削除案内、サポート案内のrepository authority用リリース候補です。最終的なProduction公開文言ではありません。下記の公開前提をすべて満たすまで、Web/iOS画面への反映や公開を行ってはいけません。

Canonical Human Decision: [`HDC_GATE5_RETENTION_PROVIDER_GOVERNANCE_AND_PUBLIC_COPY_V2`](./hdc-gate5-retention-provider-governance-and-public-copy-v2.md)、status `APPROVED_BY_HUMAN`。

## 公開前提

- G5D-5 / Gate 5 formal close
- Production provider / configuration review
- current schemaのdelete / anonymize / retain / cascade検証
- G5D-4 live proof
- Production network/data inventoryに基づくApple App PrivacyとGoogle Play Data Safetyの確認
- final Human approval
- final legal review

## プライバシーポリシー — Release Candidate

Status: `RELEASE_CANDIDATE / DO_NOT_PUBLISH_YET`

### このポリシーについて

Native Minuteは、1分間の英語スピーキング練習サービスです。このポリシーでは、Native Minuteが取り扱う情報、その利用目的、情報を処理することがある外部サービス、保持と削除、およびユーザーが利用できる選択肢について説明します。

最終公開版では、法的な運営者情報と施行日を確定します。それらと公開前提が確認されるまで、この文面は公開版のプライバシーポリシーではありません。

### 取り扱う情報

#### アカウント情報

メールアドレス、認証識別子、プロフィール設定、同意状態、アカウントおよび削除リクエストの状態など、アカウントの作成と運用に必要な情報を取り扱います。

#### 学習データ

ユーザーが作成または選択した台本、練習録音、Take、文字起こし、発音評価、苦手な単語、コーチングフィードバック、最新・ベスト結果、保存した進捗、練習に関連するお手本音声などを取り扱うことがあります。

Native Minuteが提供する公式テンプレートは共通コンテンツです。ユーザーが公式テンプレートを閲覧または選択しただけで、そのテンプレート自体がユーザー固有の削除対象になるわけではありません。ユーザー固有のコピー、選択、録音、学習履歴はユーザーに関連するデータとして扱います。

#### Voice Cloningデータ

ユーザーがVoice Cloningを選択した場合、音声サンプル、同意録音または同意記録、cloned voiceのメタデータ、Provider処理状態、その声で生成したお手本音声などを取り扱うことがあります。

#### 技術・運用データ

サービスの提供、保護、障害調査、運用のために、端末、OS、アプリバージョン、リクエスト、エラー、セキュリティ、quota、safe-usageに関する限定的な記録を取り扱うことがあります。パスワード、token、raw provider response、signed URL、不要な音声内容を運用ログへ記録しないよう努めます。

### 利用目的

情報は、次の目的で使用します。

- ユーザー認証とアカウントの維持
- 台本、Listen、録音、文字起こし、発音評価、コーチング、Review、Progress機能の提供
- ユーザーが選択したVoice Cloningとお手本音声の生成・再生
- ユーザー所有音声の安全な保存と再生
- サポートおよび削除リクエストへの対応
- 不正利用の防止、safe-use上限の適用、障害調査、サービス保護
- 法的義務への対応および紛争・権利の保全

ユーザーの音声データを、Native Minute自身の無関係なモデル学習に使用することは予定していません。公開前にProductionのProvider設定と契約を確認し、実際の処理がこのポリシーと一致することを確認します。

### 外部サービス

Native Minuteは、記載した目的のために次のサービスを利用することがあります。

- **Supabase:** 認証、データベース、private file storage、保護された音声再生
- **ElevenLabs:** ユーザーが選択したVoice Cloningとお手本音声生成
- **OpenAI:** 録音の文字起こし、および有効な場合にアプリ内で明示される台本生成やコーチングなどのAI支援機能
- **Microsoft Azure Speech:** real-timeの発音評価

各サービスは、それぞれの契約とプライバシー管理に基づいて情報を処理することがあります。最終的なProduction regionやProvider設定によっては、情報がユーザーの国または地域の外で処理されることがあります。公開前に、国際的なデータ処理について追加の説明が必要か確認します。

Native Minuteは、OpenAIのmodel-improvement data sharingへユーザーデータを明示的にopt-inしません。ElevenLabsについては、Production前に適用可能なmodel-improvement opt-outとplan/configurationの範囲を確認します。承認済みの現行構成では、Microsoft Azure Speechの不要なlogging、batch persistence、custom training data保存を有効にしません。

### 保持期間

アカウント情報と学習データは、サービス提供に必要な間、ユーザーが対象データを削除するまで、またはAccount deletionが完了するまで保持します。ただし、法令、セキュリティ、不正対応、紛争、権利保全のために正当かつ限定的な保持が必要な場合を除きます。

音声サンプルまたは同意録音は、**Provider登録処理が完了し、当方での保持が不要となった後、速やかに削除します。**

運用記録、セキュリティログ、backup、scrub済みの削除証跡は、それぞれのretention cycleが完了するまで一時的に残る場合があります。Active systemからの削除や利用不能化より後に、backup内のphysical copyが期限を迎えることがあります。すべてのbackupからの即時消去は約束しません。

音声source material、quota metadata、operational logs、deletion audit recordの具体的なphysical purge期限は、Production相当のenforcementとpurge evidenceを確認するまで公開保証として記載しません。

### 同意の撤回とVoice Data deletion

ユーザーはVoice Cloningへの同意を撤回でき、別のVoice Data deletionを利用できます。Voice Data deletionは、検証済みの範囲でユーザー固有のcloned voiceと関連するvoice setup materialを削除するための機能です。アカウント、通常の練習履歴、文字起こし、スコア、Progressは、それぞれを削除するかAccount deletionが完了しない限り削除されません。

同意の撤回後は、その同意に依存する将来の処理を行いません。ただし、同意の撤回だけでアカウントやすべての学習記録が削除されたことにはなりません。

### Account deletion

ユーザーは、supportへのメールを必須とせず、Settings → Account Deletionから削除を開始できます。Account deletionでは、ユーザーに関連するデータを、Provider、Storage、database、authenticationのactive systemから管理された順序で削除または匿名化します。結果がunknownまたは未解決の段階をcompletedとして扱いません。

限定的なscrub済み証跡、security logs、backup copyは、該当するretention cycleまたは有効なlegal holdの間、一時的に残る場合があります。削除済みデータをbackupから通常の製品機能へ復元または再利用しません。

対象範囲、処理順序、対応目標、例外、不可逆操作の注意事項については、下記のAccount Deletion Release Candidateを参照してください。

### セキュリティ対策

Native Minuteは、アクセス制御、所有権確認、private Storage、server-side Provider boundary、least-privilege database authority、redacted operational output、destructive operationのguard、段階的なverificationなどにより、ユーザーデータを保護します。ただし、いかなるシステムも絶対的な安全性を保証するものではありません。サービスやProduction構成の変更に応じて対策を見直します。

### ユーザーの選択と権利

適用法令に応じて、ユーザーは自身のデータに関する問い合わせ、不正確なアカウント情報の訂正、Voice Cloning同意の撤回、Voice Data deletion、Account deletion、プライバシー上の懸念に関する連絡を行えます。保護された情報の開示や変更前に、本人または所有者の確認をお願いする場合があります。

連絡先: `nativeminutes.support@gmail.com`

通常のメールでは、パスワード、Magic Link、認証コード、token、cookie、API key、Provider ID、Storage object key、signed URL、音声録音を送らないでください。

### ポリシーの更新

機能、Provider、法的義務、Production構成の変更に応じて、このポリシーを更新することがあります。公開版には施行日を記載し、重要な変更については必要に応じて案内します。

## Account Deletion — Release Candidate

Status: `RELEASE_CANDIDATE / DO_NOT_PUBLISH_YET`

### Account deletionの開始

Native Minuteを端末からアンインストールしても、アカウントやserver-side dataは削除されません。**Settings → Account Deletion**から削除を開始してください。開始前にsupportへメールする必要はありません。

確認前に、画面に表示される削除範囲をよく確認してください。各段階が完了した後のAccount deletionは不可逆であり、削除された録音、結果、アカウントへのアクセスは復旧できない場合があります。

### 削除または匿名化の対象

アカウントの利用状況に応じて、次の情報が対象になります。

- アカウントプロフィールと認証記録
- ユーザーが作成した台本およびアカウント固有の選択・コピー
- 練習録音と保存された音声
- Take、文字起こし、発音評価、苦手な単語、コーチング、最新・ベスト結果、Progress
- 音声サンプル、同意録音または同意記録、ユーザー固有のcloned voice、関連するお手本音声
- ユーザー固有のdatabase / Storage relationship
- 検証済みschema matrixに基づいて削除、匿名化、またはscrubする運用識別情報

Native Minute公式テンプレートは共通コンテンツであり、1人のアカウント削除によってサービス全体から削除されるものではありません。ユーザー固有のコピー、選択、録音、学習履歴はAccount deletionの対象です。

### 管理された削除順序

Native Minuteは、Account deletionを次の順序で確認します。

1. ユーザー固有のProvider asset
2. ユーザー固有のStorage object
3. databaseの削除または匿名化
4. authentication accountの削除
5. completion verification

unknown、timeout、failed、未解決の結果をcompletedとして扱いません。安全に次の段階へ進む前に、retryまたはmanual reviewが必要になることがあります。

### 一時的に残る可能性がある情報

限定的なscrub済みdeletion evidence、security record、backupは、それぞれのretention cycleが完了するまで一時的に残る場合があります。これらを、削除済みデータを通常の製品機能へ戻す目的で使用しません。

法令、セキュリティ、不正対応、紛争、権利保全のための正当なlegal holdがある場合、削除の一部が遅れることがあります。その理由が終了した後は、対象データを適用される削除または匿名化処理へ戻します。すべてのbackupまたはtechnical copyからの即時完全消去は約束しません。

### 対応目標とmanual handling

manual handlingが必要な場合、Native Minuteは原則として**3営業日以内に対応を開始**し、原則として**30日以内のAccount deletion完了**を目標とします。これらはservice targetであり、無条件の法的保証ではありません。正当なlegal exception、本人確認・安全上の問題、未解決の外部依存、その他の適法な理由により、追加の時間が必要になる場合があります。

supportから、アプリに表示されるsafe opaque referenceの提示をお願いする場合があります。承認済みのsupport processでアカウント特定に必要な場合を除き、メールアドレスを送らないでください。また、パスワード、Magic Link、認証コード、token、cookie、API key、Provider ID、Storage key、signed URL、録音を送らないでください。

### Voice Data deletionは別の選択肢です

アカウント全体を削除せずcloned voiceを削除したい場合、Voice Data deletionを利用できます。Voice Data deletionは、アカウントと通常の学習履歴を維持しながら、検証済みの範囲でユーザー固有のcloned voiceと関連するvoice setup materialを削除するための機能です。

Voice Data deletionとAccount deletionは、範囲が異なる不可逆操作です。実行前に目的と対象を確認してください。

### support fallback

Account deletionのprimary entryはアプリ内のSettingsです。アプリ内の入口を利用できない場合、処理が進まない場合、またはmanual helpの案内が表示された場合は、`nativeminutes.support@gmail.com`へ、問題の説明、おおよその時刻、端末・アプリのversion、safe opaque referenceだけを送ってください。

## Support — Release Candidate

Status: `RELEASE_CANDIDATE / DO_NOT_PUBLISH_YET`

連絡先: `nativeminutes.support@gmail.com`

### 送ってよい情報

問題の調査に必要な範囲で、次の情報を送ることができます。

- 発生したことと期待していた動作の短い説明
- 問題が起きた画面または機能
- おおよその日時
- アプリに表示されたsafeなエラーメッセージ
- 端末、OS、アプリのversion
- アプリに表示されたsafe opaque reference

スクリーンショットを送る場合は、無関係な個人情報が写っていないことを確認してください。

### 送ってはいけない情報

次の情報を送らないでください。

- パスワード
- Magic Linkまたは認証コード
- access token、refresh token、cookie
- API keyその他のsecret
- Provider ID
- Storage object keyまたはpath
- signed URL
- 音声サンプル、同意録音、練習録音、その他のaudio file

音声は、supportが指定したsecure channelで、必要な理由を説明したうえで明示的に依頼した場合に限り送ってください。

### Account deletionのsupport

Account deletionは、**Settings → Account Deletion**から開始してください。supportは、アプリ内の入口を利用できない場合、処理が進まない場合、または`manual_required`の場合のfallbackです。開始の必須条件ではありません。

manual handlingが必要な場合、Native Minuteは原則として3営業日以内に対応を開始し、原則として30日以内のAccount deletion完了を目標とします。正当なlegal、security、identity、safety、external dependency上の例外がある場合を除きます。これらはservice targetであり、無条件の保証ではありません。

## Release verification checklist

### Implementation / deletion proof

- [ ] G5D-5 / Gate 5 formal closeが記録されている。
- [ ] アプリ内のAccount deletion entryと、別のVoice Data deletion choiceがこの文面と一致している。
- [ ] current schemaのretain / delete / anonymize / cascade matrixがend-to-endで検証されている。
- [ ] G5D-4がnew disposable Staging accountとseparate Human authorizationを使用している。
- [ ] G5D-4がProvider → Storage → DB/anonymization → Auth → completion verificationを証明している。
- [ ] cross-user mutation countが`0`である。
- [ ] reviewer evidenceがsafe opaque reference、status、reason、count、timestamp、attempt、verification resultだけを含む。

### Retention

- [ ] 音声サンプルと同意録音のcleanupにProduction相当のruntime proofがある。
- [ ] 24時間の記載は、enforcement、retry、physical cleanupがその保証を支える場合にのみ公開される。
- [ ] quota、log、auditのexpiryとpurge controlが検証されている。
- [ ] 公開文言がexpiry、anonymization、logical inaccessibility、physical purgeを区別している。
- [ ] legal holdのauthority、scope、release、post-hold deletionが運用上定義されている。

### Provider / infrastructure

- [ ] ElevenLabs model-improvement opt-outが有効で、evidenceがある。
- [ ] ElevenLabs plan、retention、zero-retention-modeの適用範囲を過大表示せず確認している。
- [ ] OpenAI endpoint、data control、model-improvement sharing設定がこの文面と一致している。
- [ ] Azure mode、region、logging、persistence、custom-training設定がこの文面と一致している。
- [ ] Supabase Production region、plan、backup retention、PITR behaviorを確認している。

### App Store / Google Play / legal

- [ ] 公開Privacy Policy URLがliveで、final approved copyと一致している。
- [ ] 公開Account Deletion / privacy choices URLがliveである。
- [ ] 公開Support URLと監視されるinboxを確認している。
- [ ] Apple App PrivacyとGoogle Play Data SafetyがProduction network/data inventoryと一致している。
- [ ] 必要なthird-party processingとinternational processing disclosureが揃っている。
- [ ] 法的な運営者名、住所その他の必要表示、連絡先が揃っている。
- [ ] final Termsがreview済みで、この文面と整合している。
- [ ] final Human approvalが記録されている。
- [ ] final legal reviewが記録されている。

すべての該当項目が完了するまで、この文書のstatusは`RELEASE_CANDIDATE / DO_NOT_PUBLISH_YET`です。
