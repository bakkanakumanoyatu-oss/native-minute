# UI / UX Direction

## Design direction title

声を育てる、1分スタジオ。

## Product metaphor

Native Minute は、自分専用の1分ボイススタジオです。

英語学習アプリというより、毎日1分だけ自分の声を整える小さな録音スタジオとして見せます。ユーザーは固定1分台本を選び、自分の声のお手本を聞き、声に出してまねて、納得したら Take を録り、今回の Take から次の1点を見つけます。

土台は Personal Voice Studio。そこに Daily Ritual の軽さと、Voice Lab の小さな発見感を足します。ただし、派手なゲーム化や複雑な制作ツールには寄せません。

## UI / UX principles

- 説明しすぎず、次の一手を気持ちよく見せる。
- 課題管理ではなく、Take を残す体験にする。
- スコアより、今回の Take と次の改善を主役にする。
- 派手なゲーム化ではなく、小さな達成感を積む。
- 音声らしさは控えめに足す。波形、録音感、スタジオ感は小さく扱う。
- スマホで片手操作できる余白とボタンを維持する。
- Listen は「スクリプトを見ながら、下部固定 bar で何度も聞いてまねる」体験を基準にする。

## UI / UX improvement cadence

UI / UX の雰囲気づくりは、small diff を 3〜5 個程度のまとまりで進め、意味のある UI Batch ごとに production 人間確認します。copy、heading、color、card hierarchy、spacing、small visual motifs、CTA wording、empty state、screen tone のような細かい改善は、単発で毎回 human confirmation を求めすぎません。

Codex は各 small diff で safety checks を通し、batch の区切りで変更内容と確認観点をまとめて報告します。標準確認は `npm run lint`、`npm run build`、`npm run typecheck`、`git diff --check`、可能なら関係する smoke です。

ただし、音声再生、録音、upload、評価、login / auth、storage、iPhone Safari 固有挙動、画面が壊れる可能性がある修正は UI Batch にまとめず、1 件ごとに人間確認します。

### Recommended UI batches

- UI Batch A: Home / Practice / Record
  - 今日の1分スタジオに入る。
  - 今日録る1本を選ぶ。
  - まず1テイク残す。
- UI Batch B: Listen / Review
  - 区切りを見ながら何度も聞いてまねる。
  - 今回の Take から次の1点を見つける。
- UI Batch C: Progress / Navigation / Return loops
  - 声のログを見る。
  - ベストテイクを見る。
  - 次に録る1本が見える。
  - また練習したくなる。

### Human review questions

- 前より「声を育てる、1分スタジオ」っぽくなったか。
- やりすぎていないか。
- スマホで読みやすいか。
- 今日も1分だけやろうと思えるか。
- どの画面が一番違和感あるか。

### Do not over-ask for human confirmation

minor copy / color / spacing の単発確認は原則不要です。Codex は checks を通したうえで次の small diff へ進めてよいです。ただし batch の区切りでは必ず報告し、人間確認の URL と観点を出します。

## Screen roles

### Home

今日の1分スタジオに入る入口。

長い説明や練習一覧を置きすぎず、Practice と Progress へ迷わず入れる状態を作ります。

### Practice

今日録る1本を選ぶ場所。

5本までの練習ストックから、今の Take を残したい1本を選びます。管理画面ではなく、今日の1分を選ぶ棚として見せます。

### Listen

お手本のリズムを耳に入れ、区切りを見ながら何度もまねる場所。

下部固定 audio bar を中心にします。スクリプトをスクロールしても、5秒戻る / 3秒戻る / 再生・一時停止 / 3秒進む / 5秒進むを常に使えることが基準です。音声操作 UI は複数箇所に重複させません。

### Record

今日の Take を残す場所。

録音手段や設定説明を増やしすぎず、自分の声で1本録って評価へ進むことを主役にします。

### Review

今回の Take から次の1点を見つける場所。

長い分析より、今回の Take、短いコメント、Focus words、次はここだけ、もう一度録る導線を先に見せます。

### Progress

声のログを見る場所。

ベストテイク、最新テイク、録音再生、5本までのストックごとの変化を見ます。通知表ではなく、自分の声の記録棚として扱います。

## What must not change

- fixed 1-minute practice を保つ。
- main loop は `listen -> record -> review -> progress` を中心に保つ。
- `/api/evaluate` の audio-first contract を壊さない。
- canonical source は server-owned data に置く。
- auth / ownership / storage access を弱めない。
- provider contract を UI 都合で変えない。
- review / progress の履歴整合を壊さない。
- Listen の下部固定 audio bar を中心にした練習体験を保つ。

## Stop conditions

- DB schema / migration が必要になる。
- API contract 変更が必要になる。
- auth / ownership / storage access に関わる。
- provider 本接続に関わる。
- Listen fixed audio bar の挙動を壊す可能性がある。
- main loop を壊す可能性がある。
- この UI direction と衝突する。
- 今後の方針が変わる複数案の判断が必要になる。

## What can change

- copy
- labels
- heading hierarchy
- card emphasis
- small visual motifs
- CTA wording
- progress / review の見せ方

## Avoid

- XP / level / treasure chest 的な強いゲーム化。
- 過剰なバッジ。
- 派手なアニメーション。
- 複雑な音楽制作アプリ風 UI。
- score を通知表のように見せること。
- 音声操作 UI を複数箇所に重複させること。

## Implementation note

この doc は UI 実装方針の判断基準です。DB schema、API contract、auth、ownership、storage、provider contract を変更する根拠にはしません。実装時は既存の main loop と ownership 境界を先に守り、画面上の copy / hierarchy / emphasis から小さく整えます。
