# 新能力协议与跨仓库交付

## 1. 起始策略

Authoring Beat 可声明：

```json
{"start":{"kind":"replay","variables":["h"]}}
```

未声明或 kind=continue 表示承接当前状态，不能携带重置值。replay 必须明确选择非重复的变量名；values 可覆盖选中变量的默认初值，必须有限且在该变量域内。编译成 before_speech 中的 lesson.phase.start；动作包含稳定 ID、实际目标值及作者 source_path。不会修改原旁白或生成额外 TTS。

数值目标任务可声明：

```json
{"start":{"kind":"practice","variables":["h"],"values":{"h":1}}}
```

第一版仅适用于 expression_target，不扩展到 scene3d_view_target。选中集合必须覆盖任务允许操作的变量，初始状态不能已经满足目标。没有 start 的旧任务不自动采用新语义。

运行时用实际状态生成平滑过渡。播放重新开始建立新 playback epoch；恢复断点沿用 epoch 和过渡进度。practice 首次激活和显式重试由 task+retry epoch 区分；自动重置不产生学生操作记录。转换期间判题和输入锁定，旁白在转换完成后启动。手动步进及减少动态效果路径可直接定位起点。

## 2. 数值绑定派生标签

```json
{
  "target":"circle.radius",
  "expression":"sqrt(h)",
  "allow_zero":true,
  "label":{"prefix":"r = ","precision":2}
}
```

label 来自该绑定的数值，无第二套公式。precision 为 0–6，去掉末尾零并消除负零；prefix/suffix 为静态短文本。一个片段只能有一个派生标签来源。allow_zero 仅对半径绑定开放：零时保留语义和标签，省略退化的圆周；负数和非有限数仍报错。旧静态零半径仍不合法。

## 3. 生成器接口

生成的 moment 可通过 restart_numbers 指定重演变量序号，编译器映射为 start.variables。coordinate_circle 的 radius_expression 用 n1/n2 等已声明参数表达关系；编译时转换为 OLL 别名。表达式初值、有限采样和语法可校验，语义正确性仍需要模型/课程作者负责。

新实时生成入口显式使用 construction_rules=explicit-v1，为数值练习产生起始策略；直接调用编译器默认 legacy。不会新增一次模型调用。旧课程源不经过文本启发式自动改写。

## 4. 能力与错误边界

OLL 执行版本 0.2.0 支持 binding-labels、bound-zero-radius、action:lesson.phase.start、practice-start。内容派生的 requiredCapabilities/minimumPlayerVersion 写入课程 manifest；compiler/rules 版本写入 compilation，并将详细诊断作为 compilation.json 打包。

流式追加按当前候选批次检查可执行能力，未知能力在接受前拒绝，不等整课结束。包读取核对声明，防止“写着旧版最低要求但实际包含新字段”。Canonical 结构版本仍是 0.1，新执行能力采用独立门禁。

失败进入持久化暂停状态，不通过跳过错误继续。错误包含阶段、位置、代码和游标。显式重置重新开始；同序号修正后重放不是本次实现范围。

## 5. 依赖与发布

当前所有修改均未提交。OLL 源码在相邻 octos-lesson-language；应用和课程库用 pnpm patchedDependencies，生成器用校验 SHA256 的 postinstall git apply。三个 OLL 补丁内容相同，解决“本地源码变了但消费者仍运行旧 git pin”的问题，不依赖绝对路径链接。

应用的第二个补丁针对 octos-course-library，补入浏览器包读取的声明校验。课程库自身的根包和子包都锁定与应用相同的 OLL 基线。

正式交付顺序：

1. 审查并提交 OLL 源码/schema/测试，产出固定上游版本。
2. 更新课程库与生成器固定 OLL 依赖，移除临时补丁及对应安装逻辑，重跑各自测试。
3. 提交课程库 0.1.1 作者文件、Canonical、清单、compilation.json 和两段更新音频；检查实时物化 parity。
4. 应用更新两份固定依赖，移除 pnpm 补丁，重跑应用及浏览器回归。
5. 完成真实模型/性能及教学抽检后发布课程索引。新课不可先投放到缺少 0.2.0 能力的播放器。

上述正式发布尚未执行。临时补丁是可复现的本地审查交付，不应长期替代上游源码版本。
