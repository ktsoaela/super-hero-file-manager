import './globals.css';

export const metadata = {
  title: 'Super Hero File Manager',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('stark.theme');var dark=m==='dark'||(m!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);if(dark){document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark';}}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
