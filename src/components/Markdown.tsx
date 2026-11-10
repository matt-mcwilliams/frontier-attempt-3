import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={(url) =>
          url.startsWith("source:")
            ? url
            : /^(https?:|\/|#)/.test(url)
              ? url
              : ""
        }
        components={{
          a: ({ href, children }) => {
            const s = href?.match(/^source:([^#]+)(?:#page=(\d+))?/);
            const target = s
              ? `/api/papers/${encodeURIComponent(s[1])}/pdf${s[2] ? `#page=${s[2]}` : ""}`
              : href;
            return (
              <a href={target} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
          img: () => null,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
