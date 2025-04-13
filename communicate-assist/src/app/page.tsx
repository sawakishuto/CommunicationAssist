import TextHighlighter from "./components/TextHighlighter";

export default function Home() {
  return (
    <div className="min-h-screen p-8 flex flex-col items-center justify-center">
      <h1 className="text-2xl font-bold mb-8">Text Highlighting Demo</h1>
      <TextHighlighter />
      <div className="mt-8 text-sm text-gray-500">
        <p>Type text containing the comparison string to see red underlines appear.</p>
      </div>
    </div>
  );
}
