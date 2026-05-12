# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - paragraph [ref=e5]: Native Minute
        - paragraph [ref=e6]: 今日の1分を練習する
      - navigation [ref=e7]:
        - link "Home" [ref=e8] [cursor=pointer]:
          - /url: /
        - link "Practice" [ref=e9] [cursor=pointer]:
          - /url: /scripts
        - link "Progress" [ref=e10] [cursor=pointer]:
          - /url: /progress
        - link "Settings" [ref=e11] [cursor=pointer]:
          - /url: /setup/voice
    - main [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]:
          - paragraph [ref=e15]: Practice first
          - heading "今日の1分を録って、次の一言だけ直す。" [level=1] [ref=e16]
          - paragraph [ref=e17]: Native Minute は、固定1分 script を聞く、録る、結果を見る、もう一度練習するためのアプリです。
          - link "login して今日の練習を始める" [ref=e19] [cursor=pointer]:
            - /url: /login
        - complementary [ref=e20]:
          - paragraph [ref=e21]: 1-minute loop
          - list [ref=e22]:
            - listitem [ref=e23]: 1. 見本を短く聞く
            - listitem [ref=e24]: 2. 自分で録る
            - listitem [ref=e25]: 3. 日本語で直す点を見る
            - listitem [ref=e26]: 4. 次の1回に戻る
  - alert [ref=e27]
```