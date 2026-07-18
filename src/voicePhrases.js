// 播報詞庫(固定唸稿)+voiceKey——烤製與 runtime 共用(人聲鐵律:預烤 mp3,絕不 Web Speech)。
// 兩把嗓:SCRIPTURES=和合本經文(曉臻 女聲,莊重);PHRASES=旁白(雲哲 男聲)。
export function voiceKey(text) {
  let h = 0x811c9dc5;
  const s = String(text).replace(/\s+/g, "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// ★和合本經文——每一句都經 cuv MCP lookup 逐字查驗(出14),一字不改、絕不臆造。
export const SCRIPTURES = [
  "摩西向海伸杖,耶和華便用大東風,使海水一夜退去,水便分開,海就成了乾地。", // 出14:21
  "以色列人下海中走乾地,水在他們的左右作了牆垣。",                         // 出14:22
  "以色列人看見耶和華向埃及人所行的大事,就敬畏耶和華,又信服他和他的僕人摩西。", // 出14:31
];

// 旁白(雲哲男聲)
export const PHRASES = [
  "法老的軍兵追上來了!",
  "摩西向海伸杖!",
  "水分開了——走乾地!",
  "跟緊摩西,別掉隊!",
  "快到對岸了,加把勁!",
  "全都平安上岸了!",
];
