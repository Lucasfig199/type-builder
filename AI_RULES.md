# AI Rules for Type Builder Application

This document outlines the core technologies and specific library usage guidelines for the Type Builder application. Adhering to these rules ensures consistency, maintainability, and leverages the strengths of our chosen tech stack.

## Tech Stack Overview

*   **Frontend Framework**: React.js for building dynamic and interactive user interfaces.
*   **Language**: TypeScript, providing strong typing for enhanced code quality and developer experience.
*   **Build Tool**: Vite, offering a fast development server and optimized build process.
*   **Styling**: Tailwind CSS, a utility-first CSS framework for rapid and consistent UI development.
*   **UI Components**: shadcn/ui, a collection of re-usable components built on Radix UI and styled with Tailwind CSS.
*   **State Management**: Zustand, a small, fast, and scalable state-management solution.
*   **Routing**: React Router DOM, for declarative client-side routing.
*   **Workflow Canvas**: React Flow (`@xyflow/react`), for building interactive node-based editors and diagrams.
*   **Icons**: Lucide React, a comprehensive icon library.
*   **Form Handling**: React Hook Form, for efficient and flexible form management, paired with Zod for schema validation.
*   **Notifications**: Sonner, for elegant and accessible toast notifications.

## Library Usage Rules

To maintain a cohesive and efficient codebase, please follow these guidelines for library usage:

*   **UI Components**: Always prioritize `shadcn/ui` components for building the user interface. If a specific component is not available or requires significant deviation from `shadcn/ui`'s design, create a new component in `src/components/` that composes `shadcn/ui` primitives or uses Tailwind CSS directly. **Do not modify existing `shadcn/ui` component files.**
*   **Styling**: All styling must be done using **Tailwind CSS** classes. Avoid writing custom CSS files or inline styles unless absolutely necessary for a very specific, isolated case (e.g., a third-party library that doesn't support class-based styling).
*   **State Management**: Use **Zustand** for all application-wide state management. For local component state, `useState` and `useReducer` are appropriate.
*   **Routing**: Use **React Router DOM** for all client-side navigation. All main routes should be defined in `src/App.tsx`.
*   **Icons**: All icons should be imported and used from the **`lucide-react`** library.
*   **Forms**: Implement forms using **React Hook Form** for managing form state, validation, and submission. Use **Zod** for defining form schemas and validation rules.
*   **Notifications**: For user feedback and transient messages, use **Sonner** for toast notifications.
*   **Workflow Canvas**: Any interactive diagramming or node-based workflow visualization should be built using **`@xyflow/react`**.
*   **Date Manipulation**: For any operations involving dates (formatting, parsing, calculations), use **`date-fns`**.
*   **Unique IDs**: When generating unique identifiers, use **`uuid`**.