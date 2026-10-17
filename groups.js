/* 只把「同一份原素材能直接回答」的题放一起。其余单独准备，不暗示共用故事。 */
window.PACKS_VERSION = 4;
window.MATERIAL_PACKS = [
  {
    id: "solo-p2",
    title: "单独准备的 Part 2",
    blurb: "每张卡自己一篇素材。不要合成同一个人、同一趟路、同一场谈话。",
    tint: "lavender",
    ids: [
      "n-p2-受欢迎的人",
      "n-p2-小时候学到的新技能",
      "n-p2-学习并喜欢历史的人",
      "n-p2-擅长做手工的人",
      "o-p2-拥有成功商业的人",
      "n-p2-快乐人士",
      "n-p2-喜欢拍照的人",
      "n-p2-帮别人提升健康",
      "n-p2-嘈杂地",
      "n-p2-拥挤地方",
      "n-p2-看过的名人采访",
      "o-p2-有趣视频",
      "o-p2-包含动物的故事或书",
      "n-p2-浪费时间的活动",
      "o-p2-花很久时间回复信息",
      "o-p2-想从医的人-医护职业",
      "n-p2-听不感兴趣的话"
    ]
  },
  {
    id: "senior",
    title: "职场前辈",
    blurb: "同一个人：做成过难事、做事有条理、在靠谱公司、你尊敬他。不要再往他身上加「受欢迎」或「整洁」。",
    tint: "mint",
    ids: [
      "n-p2-做困难事情并成功的人",
      "n-p2-有条理的人",
      "o-p2-在成功公司工作的人",
      "n-p2-尊敬的比你年长的人"
    ]
  },
  {
    id: "language",
    title: "会语言、也教过你的人",
    blurb: "同一个人既会学语言，也教过你方法。不是学校老师，就不要并进中学话题。",
    tint: "lavender",
    ids: [
      "o-p2-擅长学习和说语言的人",
      "n-p2-教你新技能的人"
    ]
  },
  {
    id: "project",
    title: "一次项目，和它促成的决定",
    blurb: "同一个合作项目，以及它带来的、已经发生的结果。两个决定题只换侧重点。",
    tint: "sky",
    ids: [
      "o-p2-在团队中工作",
      "o-p2-重要决定",
      "n-p2-对结果开心的重要决定",
      "o-p2-近期改变的计划"
    ]
  },
  {
    id: "purchase",
    title: "攒钱买的那件东西",
    blurb: "一次认真的购买：为什么攒、买了什么、服务如何。不是店主的故事，也不要塞进鞋表衣服。",
    tint: "peach",
    ids: [
      "n-p2-攒钱买特别物品",
      "n-p2-好的购物服务",
      "o-p1-shopping"
    ]
  },
  {
    id: "party",
    title: "一次聚会",
    blurb: "同一晚、同一群人。分清谁组织、谁收到蛋糕。唱歌、日常晚上不是这场聚会。",
    tint: "lavender",
    ids: [
      "o-p2-组织快乐活动",
      "o-p2-收到特殊蛋糕",
      "o-p2-特别场合的食物",
      "n-p2-和朋友度过的愉快夜晚",
      "n-p2-印象深刻的聚会"
    ]
  },
  {
    id: "park",
    title: "常去的公园或自然地",
    blurb: "同一个你会去散步的地方。建筑另说。",
    tint: "mint",
    ids: [
      "n-p2-喜欢的城市自然之地",
      "o-p1-long-walk",
      "o-p1-public-gardens-and-parks"
    ]
  },
  {
    id: "buildings",
    title: "建筑",
    blurb: "一栋你真的看过的楼。只有它确实是高层，才覆盖高建筑。",
    tint: "peach",
    ids: [
      "n-p2-喜欢的建筑",
      "o-p2-喜欢或不喜欢的高建筑",
      "o-p1-old-buildings"
    ]
  },
  {
    id: "trip-want",
    title: "还想再去的地方",
    blurb: "一个具体目的地。Part 1 旅行只是短问，不必写成同一篇游记。",
    tint: "mint",
    ids: [
      "o-p2-想有空时去旅游的地方",
      "n-p1-travelling"
    ]
  },
  {
    id: "daily-road",
    title: "不喜欢的那条路",
    blurb: "经常走的短途，以及路上的堵车。嘈杂、拥挤如果不是这条路，就不要并进来。",
    tint: "peach",
    ids: [
      "n-p2-不喜欢的短途旅行",
      "o-p2-交通拥堵"
    ]
  },
  {
    id: "morning",
    title: "早起和早晨",
    blurb: "一次有原因的早起，加上平时起床后做什么。",
    tint: "sky",
    ids: [
      "o-p2-早起经历",
      "o-p1-morning-routines"
    ]
  },
  {
    id: "athlete",
    title: "运动员和看比赛",
    blurb: "同一个你关注的运动员，以及一场你看过的比赛。广告、采访不是这场比赛。",
    tint: "peach",
    ids: [
      "n-p2-钦佩的运动员",
      "o-p2-喜欢的现场体育赛事",
      "o-p1-sports-programs"
    ]
  },
  {
    id: "ads",
    title: "广告",
    blurb: "一条你印象深的广告。不必是运动员代言。",
    tint: "sky",
    ids: [
      "o-p2-名人出演的广告",
      "n-p1-advertisement"
    ]
  },
  {
    id: "bad-film",
    title: "不喜欢的电影",
    blurb: "一部让你失望的片子。影院习惯用同一部举例即可。",
    tint: "lavender",
    ids: [
      "n-p2-最不喜欢的电影",
      "o-p1-films-cinemas"
    ]
  },
  {
    id: "green-law",
    title: "想提议的一条环保法",
    blurb: "两道立法题准备同一条法，垃圾回收只借观察，不必另编故事。",
    tint: "mint",
    ids: [
      "o-p2-想要颁布的环保法律",
      "o-p2-想颁布的新法律",
      "n-p1-rubbish-and-recycling"
    ]
  },
  {
    id: "drawing",
    title: "画画和纸笔",
    blurb: "同一套画画 / 书写习惯。不是历史爱好者，也不是手作人。",
    tint: "peach",
    ids: [
      "o-p1-art",
      "o-p1-pen-pencil",
      "n-p1-paper"
    ]
  },
  {
    id: "school",
    title: "中学和老师",
    blurb: "学校生活的短答。不必等于教你语言的那个人。",
    tint: "sky",
    ids: [
      "o-p1-teachers",
      "n-p1-secondary-school"
    ]
  },
  {
    id: "solo-p1",
    title: "Part 1 短答，不串题",
    blurb: "各自准备几句。放在同一组只是为了好找，不表示它们属于同一个故事。",
    tint: "sky",
    ids: [
      "n-p1-name",
      "o-p1-tidiness",
      "o-p1-headphones",
      "o-p1-exciting-activities",
      "o-p1-cars",
      "o-p1-science",
      "o-p1-dream-and-ambition",
      "o-p1-life-stages",
      "o-p1-clothing",
      "n-p1-shoes",
      "o-p1-watch",
      "o-p1-mirror",
      "o-p1-singing",
      "o-p1-evening-time",
      "o-p1-relax",
      "n-p1-tiredness",
      "n-p1-fruit-and-vegetables",
      "o-p1-websites",
      "o-p1-news",
      "o-p1-jokes-comedies",
      "o-p1-outer-space-and-stars",
      "n-p1-politeness"
    ]
  }
];
