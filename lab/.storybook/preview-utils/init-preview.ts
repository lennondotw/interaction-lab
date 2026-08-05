const setTitle = (title: string) => {
  document.title = title;
};

const TITLE = "Lennon's Lab";
const ICON_PATH = '/favicon.svg';

const initTitle = () => {
  const handleTitleChange = () => {
    const title = document.title;
    if (title !== TITLE) {
      setTitle(TITLE);
    }
  };

  const observer = new MutationObserver(handleTitleChange);
  observer.observe(document.head, {
    childList: true,
    subtree: true,
  });

  window.addEventListener(
    'load',
    () => {
      setTimeout(() => {
        observer.disconnect();
        setTitle(TITLE);
      }, 2000);
    },
    { once: true }
  );
};

const initFavicon = () => {
  const existingLink = document.querySelector('link[rel="icon"]');
  if (existingLink) {
    existingLink.remove();
  }
  const link = document.createElement('link');
  link.setAttribute('rel', 'icon');
  link.setAttribute('href', ICON_PATH);
  link.setAttribute('type', 'image/svg+xml');
  document.head.appendChild(link);
};

export const initPreview = () => {
  initFavicon();
  initTitle();
};
