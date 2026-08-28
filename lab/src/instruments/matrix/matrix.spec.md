# Matrix Component Specification

## Overview

A comprehensive utility component for displaying all possible prop combinations of UI components in a structured matrix layout. Features **automatic TypeScript type inference with zero manual annotations** and is designed specifically for Storybook integration to showcase component variants systematically.

### 🚀 Breakthrough Feature: Function Mode

The Matrix component now supports a function mode for `componentProps` that achieves **complete automatic type inference**:

```typescript
componentProps={(context) => ({
  // ✨ No type annotations needed!
  // ✨ Full IntelliSense support!
  children: `${context.matrixProps.color} ${context.matrixProps.size}`,
  onClick: (event) => console.log([event, context]),
})}
```

## Core Functionality

The Matrix component renders all possible combinations of component props using a two-tier structure:

- **Primary Matrix**: First two prop sets form the main grid layout
- **Section Groups**: Additional props create separate matrix instances with full cartesian product calculation

## Key Features

### 🔧 Automatic Type Inference ✨

- **Zero manual type annotations**: `componentProps` function mode provides automatic type inference
- **Automatic prop name inference**: Matrix fields are constrained to actual component props
- **Value type validation**: Array values must match the component's prop types
- **Smart context typing**: Context parameters automatically typed based on matrix and sections

### 🎨 Flexible Layout System

- **Grid size control**: Configure identical vs. fit-content sizing for rows and columns
- **Custom styling**: Comprehensive `className` and `classNames` support
- **Responsive design**: Container query support with flexible layouts

### ⚡ Advanced Usage Patterns

- **Helper function**: `createMatrixFor(Component)` for reusable, pre-typed matrices
- **Custom render function**: Override default rendering with custom JSX
- **Dynamic prop values**: Support function-based prop values with context access

## API Reference

### Matrix Props

```typescript
interface MatrixProps<TComponent, TMatrix, TSections> {
  component: TComponent; // React component to render
  matrix: TMatrix; // Primary matrix props (exactly 2 required)
  sections?: TSections; // Section grouping props (optional)
  componentProps?: ComponentPropsValue; // Dynamic or static prop overrides
  render?: (props) => ReactNode; // Custom render function
  className?: string; // Container styling
  classNames?: {
    // Granular styling
    matrix?: string; // Grid container
    section?: string; // Section wrapper
  };
  gridSize?: {
    // Grid sizing control
    column?: 'identical' | 'fit'; // Column sizing strategy
    row?: 'identical' | 'fit'; // Row sizing strategy
  };
}
```

### Type Inference System

The Matrix component automatically infers and constrains types based on the target component:

```typescript
// ✅ Valid - uses actual Button props with correct value types
<Matrix
  component={Button}
  matrix={{
    color: ['blue', 'red', 'yellow'],     // ButtonVariants['color'][]
    size: ['sm', 'md'],                   // ButtonVariants['size'][]
  }}
  sections={{
    disabled: [false, true],              // boolean[]
  }}
/>

// ❌ TypeScript errors - invalid prop names or values
<Matrix
  component={Button}
  matrix={{
    invalidProp: ['value'],               // Error: not a Button prop
    color: ['purple'],                    // Error: 'purple' not valid Button color
  }}
/>
```

### Helper Function Usage

For reusable, pre-typed matrices:

```typescript
const ButtonMatrix = createMatrixFor(Button);

// Fully typed without manual type annotations
<ButtonMatrix
  matrix={{
    color: ['blue', 'red'],               // Auto-completed and validated
    size: ['sm', 'md'],
  }}
  sections={{
    disabled: [false, true],
  }}
  componentProps={{
    children: (context) => {              // Context is fully typed
      return `${context.matrixProps.color} ${context.matrixProps.size}`;
    },
  }}
/>
```

### ComponentProps Modes

The Matrix component supports two modes for `componentProps` with different type inference capabilities:

#### 🚀 Function Mode (Recommended - Automatic Type Inference)

```typescript
<ButtonMatrix
  matrix={{
    color: ['blue', 'red', 'yellow'],
    size: ['sm', 'md'],
  }}
  sections={{
    disabled: [false, true],
  }}
  componentProps={(context) => ({
    // ✨ context is automatically typed!
    // ✨ No manual type annotations needed!
    children: `${context.matrixProps.color} ${context.matrixProps.size}`,
    onClick: (event) => console.log([event, context]),
    'aria-label': `${context.matrixProps.color} button`,
  })}
/>
```

**Benefits:**

- 🎯 **Zero type annotations** - TypeScript automatically infers all types
- 🚀 **Better IntelliSense** - Full autocompletion for context properties
- 🛡️ **Type safety** - Compile-time errors for invalid props or values

#### 📝 Object Mode (Legacy - Manual Type Annotations)

Support both static values and context-aware functions:

```typescript
<Matrix
  component={MyComponent}
  matrix={{ variant: ['A', 'B'], size: ['sm', 'lg'] }}
  sections={{ theme: ['light', 'dark'] }}
  componentProps={{
    // Static value applied to all instances
    onClick: handleClick,

    // Dynamic value based on current combination
    'aria-label': (context) =>
      `${context.matrixProps.variant} ${context.matrixProps.size} button in ${context.sectionProps.theme} theme`,

    // Context includes position info
    'data-testid': (context) =>
      `cell-${context.cellIndex}-section-${context.sectionIndex}`,
  }}
/>
```

## Matrix Structure

### Primary Matrix Layout

- **Requirement**: Exactly 2 prop dimensions for the main grid
- **Grid Generation**: `propsA × propsB` creates the primary matrix
- **Example**: `color: [1, 2, 3]`, `size: ['a', 'b']` → 3×2 grid

### Section Grouping

- **Optional**: Additional props create section variants
- **Cartesian Product**: All combinations of section props generate separate matrices
- **Example**: `disabled: [false, true]`, `theme: ['light', 'dark']` → 4 section combinations

### Complete Layout Example

```plaintext
sections: { disabled: [false, true], theme: ['light', 'dark'] }
matrix: { color: ['red', 'blue'], size: ['sm', 'lg'] }

Result: 4 sections × 2×2 matrix = 4 stacked 2×2 grids
│ disabled: false, theme: light │
│ [red,sm] [red,lg]            │
│ [blue,sm] [blue,lg]          │
├───────────────────────────────┤
│ disabled: false, theme: dark  │
│ [red,sm] [red,lg]            │
│ [blue,sm] [blue,lg]          │
├───────────────────────────────┤
│ disabled: true, theme: light  │
│ [red,sm] [red,lg]            │
│ [blue,sm] [blue,lg]          │
├───────────────────────────────┤
│ disabled: true, theme: dark   │
│ [red,sm] [red,lg]            │
│ [blue,sm] [blue,lg]          │
```

## Grid Sizing Options

### Column Sizing

- **`'fit'`** (default): Columns size to content (`auto`)
- **`'identical'`**: All columns equal width (`1fr`)

### Row Sizing

- **`'fit'`** (default): Rows size to content (`auto`)
- **`'identical'`**: All rows equal height (`1fr`)

```typescript
<Matrix
  component={Button}
  matrix={{ color: ['red', 'blue'], size: ['sm', 'lg'] }}
  gridSize={{
    column: 'identical',  // Equal column widths
    row: 'fit',          // Content-based row heights
  }}
/>
```

## Custom Rendering

Override default component rendering with custom JSX:

```typescript
<Matrix
  component={Button}
  matrix={{ variant: ['A', 'B'], size: ['sm', 'lg'] }}
  render={(props) => (
    <div className="custom-wrapper">
      <Button {...props} />
      <span className="debug-info">
        {props.variant}-{props.size}
      </span>
    </div>
  )}
/>
```

## Usage Patterns

### Storybook Integration

Primary use case for comprehensive component galleries:

```typescript
// Replace manual AllVariants stories with automatic type inference
export const AllVariants: StoryObj<typeof Button> = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="p-4">
      <ButtonMatrix
        matrix={{
          variant: ['default', 'outline', 'ghost'],
          size: ['sm', 'md', 'lg'],
        }}
        sections={{
          disabled: [false, true],
        }}
        componentProps={(context) => ({
          // ✨ Automatic type inference!
          children: `${context.matrixProps.variant}`,
          onClick: (event) => console.log(context.matrixProps),
        })}
      />
    </div>
  ),
};
```

### Component Testing

Generate comprehensive test cases:

```typescript
const TestMatrix = createMatrixFor(MyComponent);

// Generates all prop combinations for testing
<TestMatrix
  matrix={{ prop1: values1, prop2: values2 }}
  sections={{ prop3: values3 }}
  componentProps={{
    'data-testid': (ctx) => `test-${ctx.cellIndex}`,
  }}
/>
```

## Error Handling

### Runtime Validation

- **Matrix dimensions**: Requires exactly 2 props in matrix
- **Warning system**: Alerts when >2 matrix props provided (extras applied to all cells)
- **Graceful fallbacks**: Empty sections handled automatically

### TypeScript Errors

- **Prop validation**: Invalid prop names caught at compile time
- **Value validation**: Incorrect prop value types caught at compile time
- **Context typing**: Full IntelliSense support in `componentProps` callbacks

## Technical Implementation

### Type System Architecture

- **`InferComponentProps<T>`**: Extracts component prop types
- **`MatrixDefinition<T>`**: Maps component props to value arrays
- **`CartesianProduct<T>`**: Generates all prop combinations
- **`ComponentPropsContext<T>`**: Provides typed context for dynamic props

### Performance Considerations

- **Lazy rendering**: Only renders visible combinations
- **Key optimization**: Stable keys prevent unnecessary re-renders
- **CSS Grid**: Efficient layout without JavaScript calculations

### Styling Integration

- **Design tokens**: Built-in support for design system tokens
- **Container queries**: Responsive behavior with `@container` support
- **CSS Grid**: Modern, flexible layout system
- **Custom styling**: Full control via `className` and `classNames` props
