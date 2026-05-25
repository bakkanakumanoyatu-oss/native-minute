# UI Visual Surface System Plan

## Purpose

Native Minute の visual direction は「声を育てる、1分スタジオ」です。

この plan は、production 確認で残った「白い旧UI感」と dark studio tone のつぎはぎ感を減らすために、white / surface / shadow / background の役割を整理します。すぐに色を置き換えるための指示ではなく、次の small diff で迷わないための surface system です。

対象はまず UI Batch A の Home / Practice / Record と、layout / nav / globals の共通 surface です。Listen の下部固定 audio bar、main loop、DB / API / auth / ownership / storage / provider contract は触りません。

## Current Inventory

### Global

現在の `app/globals.css` には studio token があるものの、`--studio-panel: #fffaf3` と rgba white 系 surface がまだ広い面積で使われています。

- page background: warm neutral gradient
- primary panel: near-white warm paper
- surface: pale warm paper
- strong surface: warmer tan
- dark: studio ink
- accent: amber
- record accent: coral

課題は token の存在ではなく、どの surface をどの役割で使うかがまだ曖昧なことです。

### Layout / Nav

`header` / `footer` は `rgba(255,250,243,0.9)` や `0.8` の translucent warm white です。旧 pure white よりは改善していますが、背景との差が弱く、shadow-sm と組み合わさると旧 card shell の印象が残ります。

Nav inactive は `studio-surface`、active は `studio-ink` です。方向性は合っていますが、header surface と nav surface の階層が近く、nav が「studio control」より「淡い pill button」に見えやすいです。

### Home

Home は dark hero と action cards の役割差が出ています。一方で、hero 内の small wave card と logged-in voice settings card は near-white が目立ち、dark hero と隣接すると白い widget が貼られた印象が残ります。

### Practice

Practice は hero / cards / empty state / details / warning card に near-white surface が多く使われています。練習カードは `studio-panel -> studio-surface` gradient ですが、カードの大半が明るいため、旧 white card library の面影が残ります。

Practice の score / next action inset は tan surface になっており、ここは棚の中のラベルとして機能し始めています。今後はこの階層を他の inset にも広げると一体感が出ます。

### Record

Record hero は dark booth として成立していますが、下の section が `studio-panel` の大きな明るい面で続くため、録音ブースから旧 form card に戻ったように見えます。

Record panel 内は `studio-panel` と `studio-surface` で整理されていますが、shadow-sm と境界線がすべて同じ強さなので、録音操作、詳細、入力、状態表示の優先度がまだ surface だけでは伝わりにくいです。

## Why White Still Feels Like Old UI

白が悪いのではなく、以下の組み合わせが旧UI感を作っています。

- page background と card surface の明度差が小さく、広い near-white 面が続く。
- `shadow-sm` が多くの card に均一に入り、すべて同じ浮いた box に見える。
- `border-[var(--studio-line)]` がどの階層にも同じ強さで入り、primary / secondary / inset の差が弱い。
- dark hero が局所的に強く、その直後に明るい form surface が出るため、画面の温度が急に切り替わる。
- near-white が「紙」「操作面」「補助情報」「shell」のどれなのか定義されていない。
- success / saved / warning / secondary action がそれぞれ別の淡い面を使い、studio system ではなく過去の utility color に見えやすい。

## Proposed Visual Surface System

### Page Background

役割: スタジオの空気。カードを置く余白。

方向性:
- pure white ではなく、低彩度の warm studio neutral。
- top にだけ薄い amber / ink の light spill を入れる。
- 背景自体を派手にしない。主役は Take と操作。

推奨:
- `--studio-bg`: warm neutral
- `--studio-bg-glow`: subtle amber / ink glow

### Hero Background

役割: 画面の役割を一瞬で伝える stage。

方向性:
- Home / Record は studio ink を使える。
- Practice は dark hero ではなく、棚として warm surface + dark count plate を使う。
- dark は局所的な貼り物ではなく、page background と border / shadow の温度を合わせる。

推奨:
- Home: dark studio entrance
- Practice: warm shelf with dark slot plate
- Record: dark recording booth

### Primary Surface

役割: 主要な card / section の土台。

方向性:
- pure white ではなく、warm paper。
- 大面積では `studio-panel` を少し暗く、または page background と混ざりすぎない tint にする。
- primary surface は「読む紙」ではなく「スタジオ内の操作台」として見せる。

推奨:
- `--surface-primary`: warm paper, not white
- 明度を少し落として、dark hero との段差を減らす。

### Secondary Surface

役割: details、secondary actions、small settings、inactive nav。

方向性:
- primary surface より一段奥へ下げる。
- shadow は弱く、border も薄くする。
- 明るすぎる white pill を避ける。

推奨:
- `--surface-secondary`: muted warm neutral
- hover は明度ではなく、border / tint の少しの変化で表す。

### Inset Surface

役割: card の中の score / next action / selected recording / quota / status。

方向性:
- card の内側に沈む面。
- `shadow` ではなく `inset feeling` を border / tint で作る。
- Practice の latest take box、Record の selected take、details body に使う。

推奨:
- `--surface-inset`: warm clay / tan
- `--surface-inset-strong`: slightly deeper for metrics

### Script / Take Paper

役割: script text や take の内容を読む面。

方向性:
- ここだけは明るさを許可する。ただし pure white ではなく paper。
- 「旧UIのカード」ではなく「台本用紙」として意味づける。
- 長文が載る場合は contrast と line-height を優先する。

推奨:
- `--surface-paper`: warm ivory
- border は薄い warm line
- shadow は原則なし。必要なら very soft ambient shadow。

### Card Shadow

役割: 奥行きではなく、操作面の階層を示す。

方向性:
- すべてに `shadow-sm` を付けない。
- primary hero / important card だけ soft shadow。
- secondary / inset は shadow を消すか、border で区切る。
- dark hero の shadow と light card の shadow を同じ強さにしない。

推奨:
- `--shadow-studio-soft`: large, low opacity, warm ink
- `--shadow-studio-lift`: hover only
- inset / details: no shadow

### Border

役割: surface の境界と studio object の輪郭。

方向性:
- すべて同じ `--studio-line` にしない。
- primary card、secondary card、inset、dark hero で少し差をつける。
- border は gray ではなく warm ink / clay 系。

推奨:
- `--line-primary`: warm ink alpha
- `--line-subtle`: lower alpha
- `--line-inset`: warm clay
- `--line-dark`: white alpha for dark booth

### Primary CTA

役割: 通常の次アクション。

方向性:
- studio ink を基本にする。
- 全 page でバラバラな色にしない。
- hover は派手な色替えではなく opacity / lift / subtle warm tint。

推奨:
- `--cta-primary-bg`: studio ink
- `--cta-primary-text`: warm white

### Record CTA

役割: Take を録る、評価する。

方向性:
- record だけ coral / recording accent を使う。
- record accent は危険色ではなく「録音中の lamp」として扱う。
- Record page 以外では使いすぎない。

推奨:
- `--cta-record-bg`: warm coral
- `--cta-record-hover`: deeper coral

### Muted Text

役割: 説明を小さく保つ。

方向性:
- gray-blue ではなく warm muted。
- dark hero 上は white alpha、light surface 上は warm ink alpha。
- 説明文は増やさず、contrast は保つ。

推奨:
- `--text-muted`: warm muted
- `--text-subtle`: lower contrast only for labels

## Redefining White

白は消しません。Native Minute では white / near-white を以下のように意味づけます。

1. **Paper**
   Script text、Take summary、ユーザーが読むべき本文に使う。明るくてよいが、pure white ではなく warm ivory にする。

2. **Highlight**
   dark hero 内の小さい motif や badge に使う。大きく使わず、studio light の反射として扱う。

3. **Control Rest State**
   secondary button や input の resting state に使う場合も、warm paper と subtle border に留める。旧 white button に戻さない。

4. **Not Page Chrome**
   page background、header、footer、大きな card shell には pure white を使わない。ここで白が出ると旧UIに戻って見える。

## Application Plan

### Home

- Hero は dark studio entrance として維持する。
- Hero 内の small wave card は paper ではなく `studio light object` として小さく扱う。大きく白く見えるなら opacity を下げるか、inset surface に寄せる。
- Action cards は primary dark、secondary warm surface の関係を保つ。ただし secondary card が白く見える場合は `surface-secondary` へ下げる。
- Voice settings card は settings object として secondary surface に下げ、shadow を弱める。

### Practice

- Practice hero は棚。primary surface を大きく使うが、near-white ではなく warm shelf surface にする。
- 5 slot count の dark plate は維持し、hero 全体の anchor にする。
- Script cards は `script / take paper` と `shelf card` を分ける。card shell は warm shelf、script first line は paper inset にしてもよい。
- Latest take box は inset surface として強化する。score area が浮きすぎないよう shadow は使わない。
- Details / other actions は secondary surface に下げ、shadow を消す。
- Warning cards は utility amber ではなく studio amber notice として token 化する。

### Record

- Hero は recording booth として維持する。
- Hero 直下の details / panel は bright card ではなく booth table surface にする。
- Record panel root は primary surface、selected Take / file upload / details は inset surface。
- Native audio preview は機能要素なので残すが、周囲の container は paper ではなく take review surface にする。
- Record CTA は coral recording lamp。secondary actions は studio ink / secondary surface に留める。

### Layout / Nav

- Header / footer は page chrome。pure white / bright panel ではなく, page background より少しだけ前に出る translucent studio surface にする。
- Nav inactive は pale pill ではなく studio control。active は studio ink。
- Header / footer の shadow は弱くし、floating app shell ではなく studio console の薄い縁にする。

## Implementation Order

1. **Token naming pass**
   - `globals.css` に surface の役割 token を追加する。
   - 例: `--surface-primary`, `--surface-secondary`, `--surface-inset`, `--surface-paper`, `--line-subtle`, `--line-inset`, `--shadow-studio-soft`。
   - 既存 token をすぐ削除せず、Home / Practice / Record から段階的に使う。

2. **Layout / nav pass**
   - header / footer / inactive nav を new surface system に寄せる。
   - ここで page 全体の旧 white shell 感を先に減らす。

3. **Practice pass**
   - 最も card が多く旧UI感が残りやすいので先に整える。
   - hero shelf、script cards、latest take inset、details、notice の階層を分ける。

4. **Record pass**
   - dark booth から record panel への温度差を減らす。
   - panel root / inset / paper / record CTA を整理する。

5. **Home pass**
   - entrance と action cards の見え方を final tuning する。
   - Home は要素が少ないので、最後に全体 tone の基準として確認する。

6. **Regression check**
   - `npm run lint`
   - `npm run build`
   - `npm run typecheck`
   - `git diff --check`
   - `HOME_CSS_SMOKE_URL=http://localhost:<port>/ npm run home:css-smoke`
   - 可能なら Home / scripts / record の lightweight smoke
   - Listen fixed audio bar は直接触らない。global token の影響が出た場合だけ、見た目と操作の確認を行う。

## Guardrails

- 白を消すことを目的にしない。白は script / take paper として意味がある。
- 黒を増やすことを目的にしない。dark は stage / plate / booth / active control に限定する。
- Accent を増やしすぎない。studio amber、record coral、saved/log accent、success accent までに留める。
- `shadow-sm` の一括利用を増やさない。surface 階層は shadow より tint / border / spacing で作る。
- Listen fixed audio bar の操作や単一 audioRef には触れない。
- DB schema / migration、API contract、auth / ownership / storage access、provider contract は変更しない。
