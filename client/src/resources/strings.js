// Single resource module for every user-facing string in the client (SRS 7, internationalisation).
// Release 1.0 ships in English only; translating this file changes the UI without code changes.

const strings = {
  appName: 'Online Bookstore',
  skipToContent: 'Skip to main content',
  header: {
    homeLabel: 'Online Bookstore home',
    searchLabel: 'Search books by title, author, ISBN or keyword',
    searchPlaceholder: 'Search books (press / to focus)',
    searchButton: 'Search',
    cart: 'Cart',
    cartLabel: (count) => `Cart, ${count} ${count === 1 ? 'item' : 'items'}`,
    help: 'Help',
    login: 'Log in',
    register: 'Register',
    accountMenu: 'Account',
    accountMenuLabel: (name) => `Account menu for ${name}`,
  },
  footer: {
    contact: 'Contact',
    privacy: 'Privacy notice',
    help: 'Help',
    copyright: 'Online Bookstore Review and Catalog - Group G2, PES University',
  },
  pages: {
    notFoundTitle: 'Page not found',
    notFoundBody: 'The page you were looking for does not exist.',
    backHome: 'Go to the home page',
    comingSoonTitle: (name) => `${name} is not available yet`,
    comingSoonBody: 'This part of the bookstore is being built by another module and will appear here in a later build.',
    catalog: 'The catalog',
    search: 'Search',
    cart: 'The shopping cart',
  },
  help: {
    title: 'Help',
    intro: 'Answers to common questions about your account.',
    sections: [
      {
        heading: 'Creating an account',
        body: 'Choose Register in the header and enter your name, e-mail address and password. You can add a phone number and a delivery address now or later from your profile.',
      },
      {
        heading: 'Logging in',
        body: 'Sessions last 24 hours. After five wrong passwords in a row your account is locked for 15 minutes to protect it.',
      },
      {
        heading: 'Profile and delivery addresses',
        body: 'Open Profile from the account menu to update your details, change your password and keep up to five delivery addresses. One address is your default.',
      },
      {
        heading: 'Selling books',
        body: 'From your profile you can ask to become a seller. An administrator reviews the request and approves or rejects it.',
      },
    ],
    contactHeading: 'Contact',
    contactBody: 'For questions about your account, write to the platform administrators. Contact details are listed on this page by the platform operators.',
  },
  privacy: {
    title: 'Privacy notice',
    intro: 'This notice explains what personal data the bookstore collects and why.',
    sections: [
      {
        heading: 'What we collect',
        body: 'Your name, e-mail address and password (stored only as an irreversible bcrypt hash), and optionally a phone number and up to five delivery addresses. We record the date your account was created, your role and your account status.',
      },
      {
        heading: 'Why we collect it',
        body: 'Your e-mail address and password identify you when you log in. Your name, phone number and addresses are used to deliver orders and to send you updates about them.',
      },
      {
        heading: 'Who can see it',
        body: 'Only you and the platform administrators can see your personal details. Personal data is never placed in web addresses or written to server logs, and all traffic is encrypted with HTTPS.',
      },
      {
        heading: 'Deletion and retention',
        body: 'A deleted account is kept in an inactive state for 30 days so that it can be restored, and is then removed permanently. Backups are kept for seven days.',
      },
      {
        heading: 'Payments',
        body: 'The bookstore never captures or stores payment card details.',
      },
      {
        heading: 'Sellers',
        body: 'Sellers are responsible for the legality of what they list. Pirated or counterfeit material is prohibited.',
      },
    ],
  },
};

export default strings;
