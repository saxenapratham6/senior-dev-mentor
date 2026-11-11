import TodoList from "./components/TodoList";
import { useTodos } from "./hooks/useTodos";

export default function App() {
  const { todos, add } = useTodos();
  return <TodoList todos={todos} onAdd={add} />;
}
