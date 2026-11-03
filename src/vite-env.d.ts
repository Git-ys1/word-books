/// <reference types="vite/client" />

// 让 TypeScript 认识 CSS 模块导入（Vite 运行时能处理，类型层面需要声明）
declare module '*.css' {
  const content: string
  export default content
}
