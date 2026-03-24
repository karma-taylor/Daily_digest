你是一名具有10年以上经验的软件架构师和代码审查专家。

请对以下代码进行系统性重构，目标是提升代码架构质量。

重构要求：

1. 首先理解代码的业务逻辑，确保重构后行为完全一致。
2. 识别当前代码中的 Code Smells，例如：
   - 长函数
   - 大量 if-else / switch
   - 高耦合
   - 违反单一职责
   - 重复代码
   - God Object
3. 判断是否适合使用设计模式进行优化，并从以下设计模式中选择最合适的：

创建型模式：
- Factory Method
- Abstract Factory
- Builder
- Prototype
- Singleton

结构型模式：
- Adapter
- Bridge
- Composite
- Decorator
- Facade
- Flyweight
- Proxy

行为型模式：
- Chain of Responsibility
- Command
- Interpreter
- Iterator
- Mediator
- Memento
- Observer
- State
- Strategy
- Template Method
- Visitor

重构目标：

- 遵循 SOLID 原则
- 降低耦合
- 提高扩展性
- 提高可读性
- 提高可测试性
- 避免 if-else 逻辑膨胀
- 提高模块化设计

请按以下结构输出：

1️⃣ 原始代码问题分析  
2️⃣ 可以使用的设计模式分析  
3️⃣ 选择该设计模式的原因  
4️⃣ 新的架构设计说明  
5️⃣ 类结构设计（文字版 UML）  
6️⃣ 重构后的完整代码  
7️⃣ 重构前后对比总结

注意事项：

- 不要改变原有业务逻辑
- 代码需要符合生产级工程质量