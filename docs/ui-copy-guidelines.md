# UI Copy Guidelines

## Preferred vocabulary

- 今日の1分
- お手本
- Take
- ベストテイク
- 声のログ
- Focus words
- 次はここだけ
- まず1テイク
- もう一度まねる

## Replace candidates

| Current copy | Preferred direction |
| --- | --- |
| 練習課題 | 1分ストック / 今日の1分 |
| 練習する | 今日のテイクを録る / 1分を始める |
| お手本を聞く | お手本を耳に入れる / リズムを聞く |
| 録音する | Take を録る |
| 最新スコア | 最新テイク |
| 進捗 | 声のログ |
| 弱点語 | Focus words |
| 改善コメント | 次はここだけ |
| 未着手 | まだ録っていない |

## Tone

- 日本語中心。
- やさしいが幼くしない。
- 励ますが過剰に褒めない。
- 評価ではなく、次の一手を示す。
- 「完璧にやる」より「まず1テイク残す」。
- 技術説明より、練習行動を前に出す。

## Button wording principles

- 抽象語より行動を使う。
- 「進む」より「始める」「録る」「聞く」「まねる」を優先する。
- 1画面1主CTAを守る。
- Listen の音声操作は下部固定 bar に集約する。
- 同じ強さのボタンを並べすぎない。
- 技術名や provider 名は主導線のボタンに出さない。

## Examples by screen

### Home

Use:

- 今日の1分スタジオへ
- 1分を始める
- 声のログを見る

Avoid:

- アプリの使い方
- 進捗管理を開始
- 各種設定を確認

### Practice

Use:

- 今日録る1本を選ぶ
- 1分ストック
- まだ録っていない
- 最新テイク

Avoid:

- 練習課題一覧
- 進捗を見る
- スコア確認

### Listen

Use:

- リズムを聞く
- もう一度まねる
- 次はここだけ
- お手本を耳に入れる

Avoid:

- 音声プレーヤー
- playback
- cache
- provider
- transcript

Listen の画面では、スクリプトと区切りを見ながら下部固定 audio bar で聞き直す体験を前提にします。本文内に同じ音声操作ボタンを繰り返し出しません。

### Record

Use:

- Take を録る
- まず1テイク
- 録り直す
- この Take で評価する

Avoid:

- 録音入力
- 評価生成
- Azure Pronunciation Assessment
- audio-first

### Review

Use:

- 今回の Take
- 次はここだけ
- Focus words
- もう一度録る
- ベストテイクに残す

Avoid:

- 詳細分析
- 弱点一覧
- 総合評価を確認
- Recovery plan

### Progress

Use:

- 声のログ
- ベストテイク
- 最新テイク
- 前回の Take
- もう一度この1分を録る

Avoid:

- 進捗
- 履歴一覧
- スコア推移
- 成績表

## Technical wording boundary

以下は主導線に出さない。必要な場合だけ、設定・管理、詳細、開発者向けの文脈へ下げます。

- cache
- provider
- quota
- transcript
- diagnostics
- fallback
- callback
- session
- contract
- storage path
- audio-first
- canonical

## Copy review checklist

- その文言は次の練習行動を示しているか。
- 画面の主CTAは1つに見えるか。
- score より Take と次の改善が目立っているか。
- 技術説明がユーザーの主導線に混ざっていないか。
- Listen の音声操作が下部固定 bar 以外に重複していないか。
