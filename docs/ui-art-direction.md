# UI Art Direction

## Visual North Star

Native Minute は、スマホの中にある「小さな録音ブース」です。

ユーザーはプロの収録スタジオに入るのではなく、自分だけの静かな1分スタジオを開きます。英語学習アプリというより、自分の声を1分ずつ整え、Take を残し、次の1点を見つける場所として見せます。

画面の背景は、落ち着いたブースの壁です。台本と Take は、少し明るい紙として置かれます。音声操作は、手元にある小さな録音パネルです。Review は、録った Take に貼るコーチメモです。Progress は、積み重なった声のログ棚です。

土台は Personal Voice Studio。そこに Daily Ritual の軽さと、Voice Lab の小さな発見感を薄く足します。ただし、重い機材感、複雑な音楽制作アプリ、派手なゲーム化には寄せません。

## Product Metaphor

### Home

録音ブースへの入口。

長い説明を読む場所ではなく、今日の1分スタジオに入る気持ちを作る場所です。

### Practice

今日の台本を選ぶ棚。

管理画面ではなく、今日録る1本を選ぶ棚です。5本までの1分ストックが、声を残すための台本として並びます。

### Listen

台本を見ながら耳を合わせる場所。

お手本を聞き、区切りを目で追い、下部固定 audio bar で何度も戻してまねます。

### Record

今日の Take を残す場所。

録音ブースの中で、まず1テイクを残します。完璧に整える前に、声を保存して評価へ進む場所です。

### Review

録った Take にコーチメモを貼る場所。

通知表ではなく、今回の Take から「次はここだけ」を見つける短いメモです。

### Progress

声のログ棚。

ベストテイク、最新テイク、積み重なった録音を見返す場所です。

## Materials

### Booth Wall

ページ全体の背景です。低彩度の warm neutral を使い、スマホの中にある静かな録音ブースの壁として扱います。背景自体を主役にせず、台本・Take・操作パネルを支えます。

### Script Paper / Take Paper

台本本文、Take の要点、ユーザーが読むべき内容を載せる紙です。白や near-white を使う場合は、この paper として意味づけます。

### Control Panel

音声操作、主CTA、録音操作など、手で触る操作面です。ink / warm dark / record coral を中心に、録音ブース内の小さな操作パネルとして扱います。

### Coach Note

Review の助言、Focus words、次の1点を示す面です。紙より少しメモらしい muted amber / warm note surface を使えます。

### Log Shelf

Progress のベストテイクや履歴を置く棚です。大きな成績表ではなく、積み重なった声の記録を並べる面として扱います。

### Quiet Accent

小さな発見、保存済み、成功、注意を示す控えめな accent です。画面全体を染めず、状態や意味を少しだけ支えます。

## Color Roles

- page background: warm neutral / booth wall。
- primary surface: studio surface。大きな card / section の土台。
- script / take paper: warm paper。白に近い色はここへ限定する。
- control panel: ink / warm dark。音声操作、主CTA、active control。
- primary CTA: ink。通常の次アクション。
- record CTA: muted record coral。録音・評価に進む操作だけ少し温度を上げる。
- insight accent: muted amber。気づき、コーチメモ、注意。
- saved / success accent: muted sage。保存済み、成功、安定した状態。
- mint: dominant UI color としては避ける。使う場合は小さな状態表示に限定する。

## White Rule

white / near-white は、台本・Take・紙面・小さな highlight に限定します。

page background、大きな card shell、nav、footer、section background には使いません。白は「余白」ではなく「紙」として意味を持つ場合だけ使います。

白い面を使うときは、以下を満たす必要があります。

- そこに読むべき script / Take / note が載っている。
- 周囲の studio surface と素材差として見える。
- 大面積の旧UI shell に見えない。
- border / spacing / label で「紙」と分かる。

## Shadow / Depth Rule

色差だけで section を分けません。surface / shadow / border / spacing で面の階層を作ります。

- 影は柔らかく、少しだけ奥行きを出す。
- すべての card に同じ shadow を付けない。
- primary surface は軽く前に出す。
- secondary / inset surface は shadow より tint と border で沈める。
- dark hero だけを貼るような見せ方は禁止。
- ブースの壁、紙、操作パネル、メモが同じ空間に置かれているように見せる。

## Screen-by-Screen Art Direction

### Home

小さな録音ブースに入る入口です。

Home は、今日の1分を始める気持ちを作ります。暗い stage を使う場合も、周囲の background / card / nav と同じ studio space に置きます。黒い hero だけを貼り付けたように見せません。

### Practice

今日の台本を選ぶ棚です。

Practice は管理画面ではありません。1分ストックが、録るための台本として並ぶ棚です。card shell は warm studio surface、台本の最初の一行は script paper、最新 Take は inset surface として扱います。

### Listen

台本を見ながら何度も聞いてまねる場所です。

Listen の下部固定 audio bar は、手元の操作パネルです。スクリプトをスクロールしても、音声操作は常に使えることが基準です。本文内に同じ音声操作 UI を重複させません。

### Record

今日の Take を残す場所です。

Record は録音ブースです。録音CTAだけ record coral で少し温度を上げます。フォームや詳細は明るい旧カードに戻さず、録音台の上にある操作面として warm surface / inset surface に置きます。

### Review

録った Take にコーチメモを貼る場所です。

Review は通知表ではありません。スコアを主役にしすぎず、今回の Take、Focus words、次はここだけを coach note として見せます。

### Progress

声のログ棚です。

Progress は成績表ではありません。ベストテイクや積み重なりを見る棚です。最新 / ベスト / 保存済み録音を log shelf 上の記録として見せます。

## Do

- 小さな録音ブースとして一貫させる。
- 台本や Take は paper として扱う。
- 操作系は control panel として扱う。
- Review の助言は coach note として扱う。
- Progress は log shelf として扱う。
- 色だけでなく、面・影・余白・素材感で違いを作る。
- Daily Ritual の軽さは、短い copy、余白、迷わないCTAで出す。
- Voice Lab の発見感は、Focus words や小さな insight accent で控えめに出す。

## Don't

- ミントグリーンを主役色に戻さない。
- 真っ白な大面積カードを大量に使わない。
- ページ全体を茶色にしない。
- 黒い hero だけを貼り付けない。
- 画面ごとに別テーマを作らない。
- 音楽制作アプリのように複雑にしない。
- 派手なゲーム化をしない。
- XP / level / treasure chest 的な要素を入れない。
- score を通知表のように見せない。
- Listen の音声操作 UI を複数箇所に重複させない。

## Implementation Order

1. Design tokens
   - booth wall、studio surface、paper、inset、control panel、coach note、log shelf の token を整理する。
2. Layout / nav
   - page chrome を studio space に寄せ、旧 white / mint shell 感を先に減らす。
3. Practice
   - 最も card が多いので、棚 / 台本紙 / latest take inset の階層を先に揃える。
4. Listen
   - 下部固定 audio bar を control panel として維持し、script paper と区切り表示の見え方を整える。
5. Record
   - 録音ブース、record CTA、Take paper、form inset の関係を揃える。
6. Review
   - score card ではなく coach note として再整理する。
7. Progress
   - 成績表ではなく log shelf として、ベストテイクと積み重なりを見せる。
8. Home final adjustment
   - 全体の visual system が揃った後、入口として最終調整する。

## Guardrails

- この doc は visual implementation の判断基準です。
- DB schema / migration、API contract、auth / ownership / storage access、provider contract を変更する根拠にはしません。
- Listen の下部固定 audio bar の操作ロジックや単一 audioRef を変える根拠にはしません。
- 実装時は `docs/ui-ux-direction.md`、`docs/ui-copy-guidelines.md`、`docs/ui-visual-surface-system-plan.md` と併せて確認します。
