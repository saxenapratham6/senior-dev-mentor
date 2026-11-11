import { useState } from "react";

export function useTodos() {
  const [todos, setTodos] = useState<string[]>([]);
  return { todos, add: (t: string) => setTodos([...todos, t]) };
}
