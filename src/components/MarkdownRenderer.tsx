import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownRenderer({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ node, ...props }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border dark:border-gray-700" {...props} />
          </div>
        ),
        th: ({ node, ...props }) => (
          <th className="px-2 py-1 bg-gray-50 dark:bg-gray-800 text-left font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b dark:border-gray-700" {...props} />
        ),
        td: ({ node, ...props }) => (
          <td className="px-2 py-1 whitespace-nowrap border-b dark:border-gray-700 text-gray-700 dark:text-gray-300" {...props} />
        ),
        p: ({ node, ...props }) => (
          <p className="mb-1 whitespace-pre-wrap" {...props} />
        ),
        a: ({ node, ...props }) => (
          <a className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />
        ),
        ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-1" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-1" {...props} />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
