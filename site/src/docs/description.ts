export const documentDescription = (markdown: string, title: string) => {
  let description = '';
  Bun.markdown.render(markdown, {
    paragraph: (text) => {
      description ||= text.trim();
      return '';
    },
    code: () => '',
    html: () => '',
    image: () => '',
  });
  const text = description.replace(/\s+/g, ' ') || `${title} in effective-rsc.`;
  return text.length > 160 ? `${text.slice(0, 157).replace(/\s+\S*$/, '')}…` : text;
};
