export type ScriptStudioTemplate = {
  id: string;
  title: string;
  categoryLabelJa: string;
  situationLabelJa: string;
  targetSeconds: number;
  summaryJa: string;
  content: string;
  translationJa: string;
  focusWords: string[];
  source: "native-minute-original";
};

export const SCRIPT_STUDIO_TEMPLATES: ScriptStudioTemplate[] = [
  {
    id: "quote-like-short-line",
    title: "A line that sounds like a quote",
    categoryLabelJa: "名言っぽく短く言う",
    situationLabelJa: "短い一言に気持ちを込める",
    targetSeconds: 60,
    summaryJa: "実引用ではない、自作の名言風テンプレ。",
    content:
      "I do not need a perfect day to begin. I only need one honest minute. If I can show up for that minute, I can build a little trust with myself. Progress does not always look dramatic. Sometimes it sounds like one clear sentence, spoken calmly, again and again, until it finally feels like mine.",
    translationJa:
      "始めるのに完璧な一日は必要ありません。必要なのは、正直な1分だけです。もしその1分に向き合えたら、自分との小さな信頼を作れます。進歩はいつも劇的に見えるわけではありません。時には、1つのはっきりした文を落ち着いて何度も話し、それがやっと自分のものに感じられることです。",
    focusWords: ["honest", "minute", "calmly"],
    source: "native-minute-original"
  },
  {
    id: "natural-interview-answer",
    title: "A natural interview answer",
    categoryLabelJa: "インタビューで自然に答える",
    situationLabelJa: "質問に落ち着いて答える",
    targetSeconds: 60,
    summaryJa: "インタビュー風だが実在発言ではない自作テンプレ。",
    content:
      "If I had to describe my strength, I would say I keep going even when progress is quiet. I am not the fastest person in the room, but I pay attention, I learn from small mistakes, and I try again without making too much noise. That habit has helped me at work, and it is also helping me with English.",
    translationJa:
      "自分の強みを説明するなら、進歩が静かな時でも続けることだと思います。私はその場で一番速い人ではありませんが、よく注意を払い、小さな失敗から学び、大げさにせずもう一度試します。その習慣は仕事で役に立ってきましたし、英語でも役に立っています。",
    focusWords: ["strength", "quiet", "habit"],
    source: "native-minute-original"
  },
  {
    id: "movie-hero-decision",
    title: "The hero decides",
    categoryLabelJa: "映画の主人公みたいに決意を言う",
    situationLabelJa: "決意をセリフ風に言う",
    targetSeconds: 60,
    summaryJa: "映画っぽい余韻のある、完全自作の決意テンプレ。",
    content:
      "For a long time, I waited for someone to tell me I was ready. But maybe readiness is not a door that opens from the outside. Maybe it is a choice I make when my voice is shaking. So today, I am choosing to move. Not perfectly, not loudly, but forward. And this time, I will not ask fear for permission.",
    translationJa:
      "長い間、誰かが私に準備ができたと言ってくれるのを待っていました。でも、準備とは外側から開く扉ではないのかもしれません。声が震えている時に自分で選ぶことなのかもしれません。だから今日、私は動くことを選びます。完璧にではなく、大きな声ででもなく、でも前へ進みます。そして今回は、恐れに許可を求めません。",
    focusWords: ["ready", "choosing", "forward"],
    source: "native-minute-original"
  },
  {
    id: "speech-opening-one-minute",
    title: "A speech opening",
    categoryLabelJa: "スピーチ冒頭の1分",
    situationLabelJa: "聞き手を静かに引き込む",
    targetSeconds: 60,
    summaryJa: "スピーチ冒頭風だが実在スピーチではない自作テンプレ。",
    content:
      "Before I share the main point, I want to start with something simple. Most meaningful change does not begin with a big announcement. It begins with a small decision that we repeat when nobody is watching. Today, I want to talk about that kind of decision, because it is easy to ignore, but hard to replace.",
    translationJa:
      "本題を話す前に、シンプルなことから始めたいと思います。意味のある変化の多くは、大きな宣言から始まるわけではありません。誰も見ていない時に繰り返す、小さな決断から始まります。今日はそのような決断について話したいです。なぜなら、それは見過ごしやすいけれど、他のもので置き換えにくいからです。",
    focusWords: ["meaningful", "decision", "repeat"],
    source: "native-minute-original"
  },
  {
    id: "drama-like-small-talk",
    title: "A drama-like coffee chat",
    categoryLabelJa: "海外ドラマっぽい雑談",
    situationLabelJa: "軽い会話に少し感情を入れる",
    targetSeconds: 60,
    summaryJa: "海外ドラマの会話っぽいが、実台詞ではない自作テンプレ。",
    content:
      "Honestly, I thought I wanted an exciting weekend, but I think I just needed a quiet one. I made coffee, ignored my phone for a while, and cleaned one corner of my room. It sounds boring, I know, but it helped. Sometimes the small reset is the thing that makes Monday feel possible again.",
    translationJa:
      "正直に言うと、刺激的な週末が欲しいと思っていましたが、本当は静かな週末が必要だったのだと思います。コーヒーを入れて、しばらくスマホを見ず、部屋の一角を片づけました。つまらなく聞こえるのは分かっていますが、助けになりました。時には小さなリセットが、月曜日をまた何とかできそうに感じさせてくれます。",
    focusWords: ["honestly", "quiet", "possible"],
    source: "native-minute-original"
  },
  {
    id: "quiet-strength-at-work",
    title: "Quiet strength at work",
    categoryLabelJa: "仕事で静かに強く言う",
    situationLabelJa: "落ち着いて主張する",
    targetSeconds: 60,
    summaryJa: "強すぎず、でも譲らない仕事向け自作テンプレ。",
    content:
      "I understand why we want to move quickly, but I do not think speed should come before clarity. If the team is not aligned, we may look busy and still create more work later. My suggestion is simple. Let us decide the owner, the next step, and the deadline first. Then we can move faster with less confusion.",
    translationJa:
      "私たちが早く進めたい理由は分かりますが、速さが明確さより先に来るべきだとは思いません。チームの認識が合っていなければ、忙しく見えても後でさらに仕事を増やすかもしれません。私の提案はシンプルです。まず担当者、次の一手、締め切りを決めましょう。そうすれば、混乱を減らしてより速く進めます。",
    focusWords: ["clarity", "aligned", "owner"],
    source: "native-minute-original"
  }
];
