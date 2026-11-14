import './globals.css';

export const metadata = {
  title: 'Super Hero File Manager',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
