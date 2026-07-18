# CLAUDE.md — 紅海過乾地 Red Sea 3D(維護守則)

**C1 Formation 的首跑與地基的家**(2026-07-18 晚,agape250)。底座=jonah-water3d 殼。

## ★C1 地基:src/formation.js(收割不重寫)
零依賴純 {x,z} 算術、零遊戲耦合:`slotOffsets(n)` 槽位、`FollowerBand`(arrive 趨近+分離+繞障+
落後自動加速歸隊)、`cohesion()` 聚攏度。換皮:五餅二魚=分組群眾、以斯拉護送照搬。

## ⛪ 神學鐵則
- 海分開=耶和華的作為(出14:21)——摩西舉杖是**敘事按鈕固定觸發**,不是玩家技能。
- **水牆等全隊過完才合攏**(合攏的是追兵;絕不能關在以色列人身上)。
- 玩家=牧養:把人一個一個帶過去;落後者永遠會歸隊(一個也不失落),永不會輸。
- 經文 出14:21/22/31 已 cuv 逐字驗;曉臻唸經+雲哲旁白。

## 架構
狀態機:menu→staff(舉杖)→part(牆升)→cross(走乾地,A/D 導引+礁石繞行)→close(牆合攏)→done。
水牆=垂直 plane 每幀用 water-kit waterHeightAt 位移(牆是活的+牆裡有魚)。
★鏡頭鐵則:永遠留在走廊內(半寬 6)——出牆=隔著半透明水牆看,整片暗藍(首跑實踩)。
量值:DIFFICULTY_PRESETS(distance/rocks/band 人數);formation 手感在 FORMATION(formation.js)。

## 指令
npm run dev / build;node scripts/gen-voice.mjs;node scripts/verify-redsea.mjs [outDir] [url]。
部署 bump sw CACHE_NAME(redsea3d-nf1→nf2…);上架要使用者逐字點名;完成同步 sites.json。

榮耀歸神。
