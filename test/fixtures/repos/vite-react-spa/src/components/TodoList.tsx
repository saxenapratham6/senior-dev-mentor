import TodoItem from "./TodoItem";

export default function TodoList({ todos, onAdd }: { todos: string[]; onAdd: (t: string) => void }) {
  return (
    <ul>
      {todos.map((t) => (
        <TodoItem key={t} text={t} />
      ))}
      <button onClick={() => onAdd("new")}>Add</button>
    </ul>
  );
}
