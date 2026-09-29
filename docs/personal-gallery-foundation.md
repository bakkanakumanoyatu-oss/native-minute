# Personal Gallery foundation — LOCAL

Humanは `outputs/gallery-personal-prototype/` の基本方向を受け入れた。製品ではGalleryを「話してみたい場面・言葉を集める場所」、Scriptsを「実際に練習する台本」として分ける。見本保存も手入力も英文なしで完了する。保存だけではScript、provider call、TTS、評価、quota消費を作らない。

`0038_personal_gallery_collection.sql` は未適用。`NATIVE_MINUTE_ENABLE_PERSONAL_GALLERY=0` が既定で、通常Preview push後も新しい個人UI/APIは開かない。Mobileはbuild時に同じ値を固定する。0038をStagingへ適用してからWeb serverとMobile buildの両方で `1` にする。`personal_gallery_items.user_id` は `profiles(id) ON DELETE CASCADE`。既存account deletion finalizerはScriptを削除してからProfileを削除するため、個人Gallery行もProfile削除で消える。通常writeはtable ACLで閉じ、owner-scoped SECURITY DEFINER RPCが `script_owner_write_lock` を通る。公式見本保存だけserverが公開IDからcanonical metadataを読み、service role専用RPCへ渡す。private runtime英文はコピーしない。

検索はowner内の6 field、Source/Theme、最近保存/作品名順、30件ページング。全文検索サービスは追加しない。保存英文は最大20,000 UTF-16 units。台本化ではDBの保存英文を再取得し、全文またはその連続部分を検証して既存 `create_script` RPCへ原子的に渡す。200語/2,000 UTF-16、active-10、revision snapshotを維持。1つのGallery itemから1本のScriptだけ作成し、リトライは同じScriptを返す。Galleryを削除するとsource linkはNULLになるがScriptと履歴は残る。

Webは `/gallery` と `/api/personal-gallery/*`、Mobileは既存のBearer BFF規約の `/api/mobile/personal-gallery/*` を使う。公式PRACTICEの直接台本化は既存経路のまま。個人英文は公開manifest、Mobile静的bundle、prototypeへ入れない。

LOCAL確認は `python3 scripts/personal-gallery-isolated-test.py`、対象Vitest、lint/typecheck/build、`git diff --check`。隔離DBはネットワークなしの一時Postgresで、終了時に破棄する。実ユーザーの永続保存はまだ検証していない。

**NEXT_ONE_ACTION:** 0038をdedicated Stagingへ適用し、Personal Gallery Web/MobileをStagingへcutoverして、Humanが実際の永続保存を使う。
