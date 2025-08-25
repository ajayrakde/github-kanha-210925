import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { defaultSchema } from 'rehype-sanitize';
import type { ReactNode } from 'react';

interface MarkdownRendererProps {
  content: string;
  compact?: boolean;
  className?: string;
}

// Custom sanitization schema with safe URL schemes and attributes
const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel'],
    src: ['http', 'https'],
  },
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a || []), 'target', 'rel'],
    img: [...(defaultSchema.attributes?.img || []), 'loading', 'decoding'],
  },
};

export function MarkdownRenderer({ content, compact = false, className = '' }: MarkdownRendererProps) {
  if (!content) return null;

  // For compact views, show only first paragraph without formatting
  if (compact) {
    const firstLine = content.split('\n')[0].replace(/^#+\s+/, '').replace(/[*_`]/g, '');
    const truncated = firstLine.length > 100 ? firstLine.slice(0, 97) + '...' : firstLine;
    return (
      <p className={`text-sm text-gray-600 ${className}`}>
        {truncated || 'No description available'}
      </p>
    );
  }

  return (
    <div className={`prose prose-sm max-w-none prose-gray dark:prose-invert ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          // Headings with app typography
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 mt-4 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 mt-4 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 mt-3 first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1 mt-2 first:mt-0">
              {children}
            </h4>
          ),
          // Paragraphs with app spacing
          p: ({ children }) => (
            <p className="text-gray-600 dark:text-gray-300 mb-3 last:mb-0 leading-relaxed">
              {children}
            </p>
          ),
          // Links with app styling and security
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-sm"
              {...props}
            >
              {children}
            </a>
          ),
          // Lists with proper spacing
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-3 space-y-1 text-gray-600 dark:text-gray-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-3 space-y-1 text-gray-600 dark:text-gray-300">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          // Blockquotes with themed border
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-4 italic text-gray-600 dark:text-gray-300">
              {children}
            </blockquote>
          ),
          // Inline code with app styling
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return (
                <code className={`${className} block bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-3 rounded-md overflow-x-auto text-sm font-mono border border-gray-200 dark:border-gray-700`}>
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">
                {children}
              </code>
            );
          },
          // Code blocks
          pre: ({ children }) => (
            <pre className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md overflow-x-auto mb-4 border border-gray-200 dark:border-gray-700">
              {children}
            </pre>
          ),
          // Images with responsive styling
          img: ({ src, alt, ...props }) => (
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="max-w-full h-auto rounded-md shadow-sm my-4"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const altText = document.createElement('div');
                altText.className = 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-center py-8 px-4 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600';
                altText.textContent = alt || 'Image failed to load';
                target.parentNode?.insertBefore(altText, target);
              }}
              {...props}
            />
          ),
          // Tables with responsive design
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded-md">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-50 dark:bg-gray-800">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-gray-50 dark:hover:bg-gray-800">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
              {children}
            </td>
          ),
          // Strong and emphasis
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-900 dark:text-gray-100">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-gray-700 dark:text-gray-200">
              {children}
            </em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}