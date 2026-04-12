# George Putney — Portfolio Website

Personal portfolio site built with vanilla HTML, CSS, and JavaScript. No frameworks, no build tools.

**Live at:** [georgeputney.com](https://georgeputney.com)

---

## Pages

- **Home:** Hero, about, skills, featured projects, and contact.
- **Experience:** Timeline of work history.
- **Projects:** Full project showcase.

## Stack

- HTML5, CSS3, vanilla JavaScript.
- [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond) (headings) + [DM Sans](https://fonts.google.com/specimen/DM+Sans) (body) via Google Fonts.
- No dependencies, no build step. Open `index.html` in a browser and it works.

## Structure

```
portfolio-website/
├── index.html          # Home page
├── styles.css          # Global styles
├── nav.js              # Shared nav component
├── footer.js           # Shared footer component
├── experience/
│   └── index.html      # Experience page
└── projects/
    └── index.html      # Projects page
```

## Features

- Responsive across desktop, tablet, and mobile
- Scroll-triggered fade-up animations via Intersection Observer
- Mobile hamburger menu with drawer overlay
- Shared nav and footer injected via JS to avoid duplication
- SVG illustrations embedded in project cards
- Smooth scroll-to-top with cubic easing

## Development

No setup required. Clone and open in a browser:

```bash
git clone https://github.com/gputney/portfolio-website.git
cd portfolio-website
open index.html
```

Or use any static file server:

```bash
npx serve .
```
