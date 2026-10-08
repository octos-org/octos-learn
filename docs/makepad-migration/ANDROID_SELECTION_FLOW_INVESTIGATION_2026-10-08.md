# 安卓大屏选区提问问题：只读调查（2026-10-08）

安装版本仍为产品2666794、OLL4263b22、Makepad825dbb4加已授权的颜色补丁。本轮按用户反馈读取当前电视截图、应用日志、代码及本机后端状态，**没有注入触摸、重启应用、重新提交生成、修改实现或删除记录**。

## 画面事实

两次原始3840×2160截图相隔736秒（约12分钟），均显示「马鞍面与鞍点：梯度为零不一定是极值点」的完成总览。左侧有手写 `y = Sin(x)`，右侧紧邻的是「我的问题」和「正在搭建这节课」。问题卡片与笔迹重叠；卡片及原课程文字明显小于屏幕工具栏和手写字。第二次截图仍有加载卡，没有看到新增课程内容。

第一次查看默认缩略截图时，GPT误将这两张小卡片当成课程内容；用户指出位置后，已用原始分辨率截图纠正。两张原图、完整日志只保留在 `.local-dev/tv-selection-investigation-2026-10-08/` 及本地调研镜像，不入Git。未拍到提问面板打开或工具栏选区状态，用户对这些操作的反馈与下面代码核对分开记录。

## 五项核对

1. **选中笔迹只出现「问小章鱼」**：代码里仍有「解释这部分」「检查并建议」「生成函数图像」，没有删掉。`native/octos-learn/src/ink_question.rs` 的 `quick_tools()` 要求识别状态ready、类型非unknown、置信度非low，否则工具栏工具列表为空。Web采用同样门槛。识别需先登录、上传选区，再调用 `learning.selection.classify`。所以仅凭没有按钮，不能判断是遗漏功能；本次实际识别状态未取得。
2. **提问弹窗未按安卓缩放**：代码确认有遗漏。原生面板固定left18 /top142 /width420 /padding14，没有Android分支；Web安卓模式为left8 /top88 /width≤300 /padding8，并限制最大高度。原生动态选项按钮height34、发送height36，也沿用桌面尺寸。原生位置见 `native/octos-learn/src/lib.rs` 的sel_panel、selection_chip；Web对照见 `src/learning/learning-workspace.css` 的安卓 `.learning-selection-question` 规则。
3. **解释后一直搭建**：截图确认加载状态至少跨越两次取图仍在。没有查到可将此请求关联到具体生成job的证据，不能下结论是LLM慢。后端health正常，solo可用，reverse50080存在；本机solo账户的只读 `session/list` 此次返回0条，仅作为关联线索，不证明服务器完全没有任务。APK进程日志没有开启请求详情，包非debuggable，`run-as`及普通shell读取私人进度目录均被拒绝，没有进一步提权。源码中HTTP/WS客户端没有应用级请求超时；WsClosed /WsError只将socket状态改Closed，不自动给未完成调用发失败或恢复job，也没有主动轮询job状态，因此存在无限pending的路径。但本次是否走此路径未确认。
4. **问题 / 加载卡未避让预制课程**：截图确认与笔迹重叠且被放在原课程左侧。`new_topic_origin()`只收集辅助卡及question_source，没有收集已有课程的geometry；且仅board为空时才计算origin。已有课程时 `place_host_cards()`直接使用已有课程左上角，将问题 /加载卡宽度向左扣除，而非寻找右侧空闲区域。另外首次把课程转课堂时，`ask_selection_lesson()`先set_question_source，随后sync_live调用set_topic_context；新session会清掉question_source。这是代码中的确定行为，不是仅视觉猜测。Claude上轮验证的「空白板＋辅助卡」路径不能代表此「预制课程＋选区」路径。
5. **笔迹很大、卡片很小**：截图确认相对尺寸悬殊。当前小卡片是原课程与问题 /加载卡，尚未看到新生成课程。代码中卡片文字随世界相机缩放，笔迹的stroke宽度则除以camera.scale以保持屏幕粗细。根据固定世界宽度（问题270、加载360）和截图约236 /315物理px，结合物理/逻辑倍率4，推算当前相机scale约0.22；这是截图推算，不是读取到的运行态数值。整课总览下画面缩得很小、用户在该缩放下书写，足以出现很大的世界笔迹与很小的课程字；本次没有测得坐标倍率错误，不能直接归因到系统density或1080p渲染。

## 请求链路的额外线索与限制

只读 `/proc/23431/net/tcp6` 中，APK UID10075有指向localhost50080的连接，其中三条CLOSE_WAIT各有121 bytes接收队列，另有一条ESTABLISHED、17 bytes接收队列；反向监听仍在。[过滤记录](evidence/tv-selection-investigation-2026-10-08/native-network-rows.txt)。这只能证明存在未结束连接和未读取字节，未取得请求路径或字节内容，不能认定这些连接就是此次选区请求或据此断言某个网络根因。未启用新的诊断属性，因为会影响用户正在测试的状态，并可能把带鉴权头的完整请求写入日志。

调查范围为以上画面事实与静态代码分析，没有复现新请求、没有性能测试、没有做修复。原始证据时间及最小汇总见 [inspection-summary.json](evidence/tv-selection-investigation-2026-10-08/inspection-summary.json)。
