export interface Page {
  url: string;
  name: string;
}

export interface PageProps {
  pages: Page[];
  currentPage: Page;
}
