import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'Composer — Date Planning',
  description: 'Plan dates with full itineraries for Manhattan & Brooklyn.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="app-container">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
