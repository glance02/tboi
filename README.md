# 里该隐合成计算器

适用于 **《以撒的结合：忏悔》** 的简体中文合成袋计算器，支持手机浏览。
输入本局种子和里该隐合成袋中的 8 个掉落物，即可查看准确的合成结果。

本工具面向无法使用游戏内配方提示模组（如 External Item Descriptions）的主机玩家。
支持以下两个版本；相同种子在不同版本下可能产生不同结果：

| 版本 | 平台 | 数据来源 |
| --- | --- | --- |
| 忏悔（Repentance）v1.7.9b | Nintendo Switch | frto027 数据 @ `af9fb78` |
| 忏悔+（Repentance+）v1.9.7.15 | PC、Switch 2 | frto027 数据 @ `abd3370` |

快速判断版本：使用 8 枚炸弹合成。得到**炸弹先生（Mr. Boom）**表示忏悔，得到**大爆弹先生（Mr. Mega）**表示忏悔+。

## 功能

- 简体中文界面、掉落物名称、道具名称与拾取提示；道具链接指向以撒的结合中文维基。
- 道具预览与配方查询均支持中英文名称搜索，不区分英文大小写；名称按中文拼音排序。
- 种子输入支持校验和检查，可发现输入错误；支持直接输入 `jkd9z0c9` 等格式，并自动将 O、I 转为 0、1。
- 点击掉落物填入合成袋。与游戏一致，袋满后再添加会挤出最早放入的掉落物。
- 显示合成道具、拾取提示、品质和维基链接。
- 袋内有 6 或 7 个掉落物时，预览补齐材料后可合成的所有道具，支持按名称或品质排序、搜索，并优先显示最容易收集的材料。点击结果即可补齐合成袋。
- 查询指定道具的配方：检查当前种子下约 3000 万种材料组合，列出固定配方与最易收集的种子配方。袋内已有材料时，显示补齐方式；无法直接补齐时，显示最接近的配方及需要替换的材料。点击配方即可填入合成袋。
- 设置中可排除不常见的掉落物，或隐藏掉落物名称以启用紧凑布局。
- 道具尚未解锁时，显示合成袋可能产出的后续替代道具。
- 支持影响结果的特殊条件：贪婪模式、每日挑战、挑战模式、子宫及之后的楼层、十字圣球、金色或叠加的“不！”饰品，以及联机角色条件（店主、持有长子名分的游魂、里游魂）。
- 自动在本机保存种子、版本、合成袋和设置。
- 无需构建。通过 [Umami](https://umami.is) 统计页面访问量，不使用 Cookie。

## 实现原理

`js/crafting.js` 是游戏合成算法的 JavaScript 移植版。算法与道具数据由
[frto027](https://github.com/frto027) 为[以撒的结合中文维基](https://isaac.huijiwiki.com/wiki/C710)逆向整理：
[合成模拟器源码](https://github.com/frto027/IsaacBagOfCraftingHuijiGadget)、
[C++/WASM 源码](https://github.com/frto027/IsaacDecraftingHuijiGadget)。
与游戏一致，权重运算采用 32 位浮点数，以保证临界种子的计算结果准确。

`js/finder.js` 负责反向查询。它根据道具抽取表对材料组合分组（抽取表仅取决于材料总价值的品质范围，以及会引入道具池的特殊材料），跳过不可能包含目标道具的表，并按游戏顺序遍历材料、更新随机数状态。完整搜索在 Web Worker 中运行，通常需要几秒钟。

`js/zh-cn.js` 按道具 ID 保存中文名称和拾取提示，与自动生成的 `js/data.js` 分开维护。
`js/localization.js` 统一处理中文显示、中英文搜索、拼音排序及中文维基链接。
重新生成游戏数据不会覆盖中文翻译；未来新增道具若尚未翻译，会回退显示英文。
拾取提示为项目译文，措辞可能与游戏内中文不同。英文名称保留在原始数据中供搜索使用。

`scripts/test.mjs` 将随机种子、材料组合和特殊条件分别传入本项目与 frto027 的参考 WASM，比较两个游戏版本的结果，并双向验证配方查询与 `craft()` 的一致性。

## 本地运行

页面使用 ES 模块，需要通过 HTTP 服务访问。在项目目录执行：

```sh
python -m http.server 8765
```

然后打开 <http://localhost:8765>。

## 重新生成数据与运行测试

需要 Node.js 18+ 和 git。Windows 用户可在 Git Bash 中执行下载脚本。

```sh
sh scripts/fetch-reference.sh   # 下载参考数据至 reference/
npm run data                    # 重新生成 js/data.js
npm test                        # 与参考 WASM 比较，并验证配方查询
npm run test:localization       # 检查翻译覆盖、中英文搜索和排序
```

界面或脚本更新时，请同步递增 `index.html` 中的资源版本号及所有 JS 导入中的 `?v=`，避免浏览器混用缓存文件。

## 致谢与许可

- 合成算法与道具数据：[frto027](https://github.com/frto027)，CC BY-NC-SA 3.0。
- 英文道具名称与拾取提示：游戏数据，经由 [bladecoding/isaac-bagofcrafting](https://github.com/bladecoding/isaac-bagofcrafting) 整理。
- 中文道具名称：参考 [External Item Descriptions 的简体中文词表](https://github.com/wofsauge/External-Item-Descriptions/tree/master/descriptions)中的道具名称，按游戏道具 ID 对应；未引入模组说明文本或代码。
- 游戏素材归 Edmund McMillen 和 Nicalis 所有。本项目为玩家作品，与其无关联。

本项目衍生自 frto027 的作品，采用相同的 [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) 许可协议：允许署名分享与改编，不得商用，改编作品须以相同协议发布。
