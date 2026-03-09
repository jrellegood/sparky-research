# Swift Macros: Compile-Time Metaprogramming That Actually Makes Sense

Swift 5.9 introduced macros in 2023, and by 2026, they've become foundational to modern Swift development. If you've used SwiftUI with `@Observable`, SwiftData with `@Model`, or even just noticed `#Preview` in Xcode, you've already been using macros—even if you didn't realize it.

But here's what makes Swift macros interesting: unlike the preprocessor nightmares of C/C++ or the runtime reflection gymnastics of other languages, Swift macros are **type-safe, compile-time code generators** that integrate directly into the build process. They're powerful enough to drive Apple's newest frameworks, yet constrained enough that they can't shoot you in the foot.

Let's talk about what they actually are, when to use them, and—crucially—when not to.

## What Are Swift Macros? (The Real Definition)

A macro is **source code that generates other source code at compile time**. That's it. No runtime cost, no dynamic behavior, no magic. When the compiler encounters a macro, it:

1. **Parses your code** into an Abstract Syntax Tree (AST) using SwiftSyntax
2. **Runs the macro's expansion logic** (which is just Swift code)
3. **Inserts the generated code** into your program
4. **Continues compiling** as if you'd written that code by hand

The key insight: macros are **additive only**. They can add code, but they can never delete or modify existing code. This constraint is what makes them safe—a macro can't silently change the behavior of code you wrote.

### Two Flavors: Freestanding vs Attached

**Freestanding macros** start with `#` and expand into expressions or declarations:

```swift
// Expression macro - generates code inline
let url = #URL("https://example.com")  // Compile-time validated URL

// Declaration macro - generates new declarations
#warning("TODO: Implement this feature")  // Compiler warning
```

**Attached macros** start with `@` and modify the declaration they're attached to:

```swift
@Observable  // Adds observation infrastructure
class User {
    var name: String = ""
    var email: String = ""
}

@Model  // SwiftData persistence + observation
class Article {
    var title: String
    var content: String
}
```

The distinction matters: freestanding macros are explicit call sites, while attached macros look like attributes but do much more.

## The Real-World Use Cases (What Apple Actually Ships)

### 1. `@Observable` - The Observation Framework

Before Swift 5.9, making a SwiftUI model observable required boilerplate:

```swift
class User: ObservableObject {
    @Published var name: String = ""
    @Published var email: String = ""
    @Published var isActive: Bool = true
}
```

With `@Observable`, it's just:

```swift
@Observable
class User {
    var name: String = ""
    var email: String = ""
    var isActive: Bool = true
}
```

**What the macro actually does** (expanded):

```swift
@ObservationTracked
class User {
    @ObservationTracked var name: String = "" {
        get { access(keyPath: \.name); return _name }
        set { withMutation(keyPath: \.name) { _name = newValue } }
    }
    private var _name: String = ""
    
    // ... same for email and isActive
    
    private let _$observationRegistrar = ObservationRegistrar()
    
    internal nonisolated func access<Member>(
        keyPath: KeyPath<User, Member>
    ) {
        _$observationRegistrar.access(self, keyPath: keyPath)
    }
    
    internal nonisolated func withMutation<Member, T>(
        keyPath: KeyPath<User, Member>,
        _ mutation: () throws -> T
    ) rethrows -> T {
        try _$observationRegistrar.withMutation(of: self, keyPath: keyPath, mutation)
    }
}

extension User: Observable {}
```

That's 30+ lines of boilerplate generated from a single `@Observable` annotation. The macro tracks property access, registers observers, and handles change propagation—all at compile time.

### 2. `@Model` - SwiftData Persistence

SwiftData's `@Model` macro does even more:

```swift
@Model
class Article {
    var title: String
    var content: String
    var publishedAt: Date?
}
```

Expands to add:
- `PersistentModel` conformance
- `Observable` conformance
- Schema metadata for Core Data backing store
- Relationship handling
- Migration support

It's essentially generating the entire Core Data stack configuration you used to write by hand (or avoid entirely because it was painful).

### 3. `#Preview` - SwiftUI Previews

The old way:

```swift
struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
```

The new way:

```swift
#Preview {
    ContentView()
}
```

Less boilerplate, better ergonomics, and the macro handles preview registration automatically.

## When to Write Your Own Macros

Most developers will **use** macros far more often than they **write** them. But there are legitimate reasons to create custom macros:

### 1. Eliminating Repetitive Boilerplate Across a Codebase

If you find yourself writing the same 20 lines of code in 50 places, a macro might help. Example: auto-generating `Codable` conformance for types with custom encoding logic.

```swift
@AutoCodable
struct APIResponse {
    let id: UUID
    let createdAt: Date
    let data: [String: Any]  // Custom encoding needed
}
```

### 2. Enforcing Compile-Time Constraints

Macros can validate invariants at build time:

```swift
@MainThreadOnly
var userInterface: UIView?  // Compile error if accessed off main thread
```

This is more reliable than runtime assertions because it catches bugs before the code even runs.

### 3. Domain-Specific Language (DSL) Sugar

If you're building a framework, macros can make your API more ergonomic:

```swift
@Route("/api/users/:id")
func getUser(id: String) async -> User {
    // Macro generates routing, parameter parsing, response encoding
}
```

## How to Actually Build a Macro

Creating a macro requires a separate Swift package. Here's the minimal setup:

### 1. Create the Package

```bash
swift package init --type macro
```

This generates:
- `Macros/` - The macro implementation (compile-time Swift code)
- `MacroClient/` - Example usage
- `Tests/` - Unit tests for macro expansion

### 2. Define the Macro Interface

In your main target:

```swift
@attached(member, names: named(count))
public macro Count() = #externalMacro(
    module: "MyMacros",
    type: "CountMacro"
)
```

This says: "When you see `@Count`, run `CountMacro` and add a member named `count`."

### 3. Implement the Expansion Logic

In the `Macros` target:

```swift
import SwiftCompilerPlugin
import SwiftSyntax
import SwiftSyntaxBuilder
import SwiftSyntaxMacros

public struct CountMacro: MemberMacro {
    public static func expansion(
        of node: AttributeSyntax,
        providingMembersOf declaration: some DeclGroupSyntax,
        in context: some MacroExpansionContext
    ) throws -> [DeclSyntax] {
        guard let structDecl = declaration.as(StructDeclSyntax.self) else {
            throw MacroError.notAStruct
        }
        
        // Find a property named "items"
        let hasItems = structDecl.memberBlock.members.contains { member in
            member.decl.as(VariableDeclSyntax.self)?
                .bindings.first?.pattern.as(IdentifierPatternSyntax.self)?
                .identifier.text == "items"
        }
        
        guard hasItems else {
            throw MacroError.missingItemsProperty
        }
        
        // Generate: var count: Int { items.count }
        return [
            """
            var count: Int { items.count }
            """
        ]
    }
}

enum MacroError: Error, CustomStringConvertible {
    case notAStruct
    case missingItemsProperty
    
    var description: String {
        switch self {
        case .notAStruct:
            return "@Count can only be applied to structs"
        case .missingItemsProperty:
            return "@Count requires a property named 'items'"
        }
    }
}

@main
struct MyMacroPlugin: CompilerPlugin {
    let providingMacros: [Macro.Type] = [CountMacro.self]
}
```

### 4. Use It

```swift
@Count
struct ItemCollection {
    let items: [String]
}

let collection = ItemCollection(items: ["A", "B", "C"])
print(collection.count)  // 3 - generated by the macro
```

## The SwiftSyntax Dance

The hardest part of writing macros is **navigating SwiftSyntax**—Apple's AST library. Here's what you need to know:

1. **Everything is immutable** - You construct new syntax nodes, never mutate existing ones
2. **Type names are verbose** - `IdentifierPatternSyntax`, `FunctionDeclSyntax`, etc.
3. **Pattern matching is your friend** - Use `as()` casts liberally
4. **Use Xcode's macro expansion** - Right-click a macro → "Expand Macro" to see what it generates

**Pro tip**: Start with string interpolation (`"""code here"""`) and only use SwiftSyntax builders when you need dynamic code generation.

## Testing Macros (Yes, You Should)

Macros are just Swift code, so they're testable:

```swift
import SwiftSyntaxMacrosTestSupport
import XCTest
@testable import MyMacros

final class CountMacroTests: XCTestCase {
    func testExpandsCorrectly() {
        assertMacroExpansion(
            """
            @Count
            struct Items {
                let items: [String]
            }
            """,
            expandedSource: """
            struct Items {
                let items: [String]
                
                var count: Int { items.count }
            }
            """,
            macros: ["Count": CountMacro.self]
        )
    }
    
    func testErrorsOnNonStruct() {
        assertMacroExpansion(
            """
            @Count
            class Items {
                let items: [String]
            }
            """,
            expandedSource: """
            class Items {
                let items: [String]
            }
            """,
            diagnostics: [
                DiagnosticSpec(message: "@Count can only be applied to structs", line: 1, column: 1)
            ],
            macros: ["Count": CountMacro.self]
        )
    }
}
```

## When NOT to Use Macros

Macros are powerful, but they're not always the right tool:

### 1. When a Protocol Extension Will Do

If you just need to add functionality to conforming types, use a protocol:

```swift
// Don't write a macro for this
protocol Countable {
    associatedtype Item
    var items: [Item] { get }
}

extension Countable {
    var count: Int { items.count }
}
```

### 2. When Runtime Flexibility Is Needed

Macros generate code at compile time. If behavior needs to change at runtime, use protocols, generics, or closures.

### 3. When the Boilerplate Is Actually Useful

Sometimes repetition aids readability. If hiding details makes code harder to understand, skip the macro.

### 4. When You're the Only One Using It

Macros add build-time complexity (extra package, SwiftSyntax dependency, compilation step). If the payoff is small, the juice isn't worth the squeeze.

## The Gotchas

### 1. Macros Are Isolated

A macro can only see the code attached to its declaration. It can't inspect other files, access the network, or read environment variables. This is by design—macros are sandboxed for security and reproducibility.

### 2. Error Messages Can Be Cryptic

When a macro fails, the error often points to the generated code, not your source. Use `#sourceLocation` directives to improve diagnostics.

### 3. Compilation Time

Every macro invocation adds to build time. If you have thousands of macro expansions, compilation can slow down noticeably.

### 4. Debugging Is Weird

You can't step through macro execution in a debugger. Use `print()` statements in your macro implementation (they'll appear during compilation) or write comprehensive tests.

## The Future: Where Macros Are Headed

By 2026, macros are everywhere in Apple's frameworks:
- **SwiftUI** uses them for previews and observation
- **SwiftData** uses them for persistence models
- **Swift Testing** uses them for test discovery

Third-party libraries are following suit:
- Routing frameworks generating URL handlers
- GraphQL clients generating type-safe queries
- Dependency injection containers

But the real power is **what macros enable**: frameworks can provide ergonomic APIs without runtime performance penalties. It's compile-time magic that feels like runtime flexibility.

## Practical Advice for 2026

1. **Use Apple's macros extensively** - `@Observable`, `@Model`, `#Preview` are production-ready and well-tested
2. **Write custom macros sparingly** - Only when the boilerplate is genuinely painful
3. **Test your macros thoroughly** - Bad macro expansion is a build-time error for your users
4. **Document what they generate** - Make it easy to see the expanded code (Xcode's "Expand Macro" helps)
5. **Keep them simple** - Complex macros are hard to maintain and debug

## The Bottom Line

Swift macros are **metaprogramming done right**: type-safe, compile-time, additive-only code generation that integrates seamlessly into the language. They're not as powerful as Lisp macros or as flexible as C preprocessor directives, but that's the point—they're constrained enough to be safe and maintainable.

If you're building a Swift app in 2026, you're already using macros whether you know it or not. Understanding how they work—and when to write your own—is becoming a core Swift skill.

And unlike other metaprogramming systems, Swift macros don't feel like magic. You can always expand them, inspect the generated code, and understand exactly what's happening. That transparency is what makes them actually usable in production.

**Further Reading:**
- [Swift.org: Macros Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/macros/)
- [Apple: Migrating to @Observable](https://developer.apple.com/documentation/swiftui/migrating-from-the-observable-object-protocol-to-the-observable-macro)
- [Swift-Macros GitHub Repo](https://github.com/krzysztofzablocki/Swift-Macros) - Curated examples
- SwiftSyntax on GitHub - The AST library powering macros
