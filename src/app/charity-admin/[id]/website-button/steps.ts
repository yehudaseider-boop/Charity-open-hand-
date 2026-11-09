/** Website builders charities use most, and where the code goes in each. */
export const STEPS: { name: string; steps: string[] }[] = [
  {
    name: "WordPress",
    steps: [
      "Open the page where you want the button and click Edit.",
      "Click the + where the button should go and choose Custom HTML.",
      "Paste the code into the box.",
      "Click Preview to check it, then Update.",
    ],
  },
  {
    name: "Wix",
    steps: [
      "Open your site in the Wix editor and go to the page.",
      "Click Add Elements (+), then Embed Code, then Embed HTML.",
      "Choose Code, paste the code and click Update.",
      "Drag the box to where you want it and make it big enough to show the whole button, then Publish.",
    ],
  },
  {
    name: "Squarespace",
    steps: [
      "Open the page and click Edit.",
      "Click Add Block (+) where the button should go and choose Code.",
      "Paste the code, make sure the type is HTML, and click outside the box.",
      "Click Save, then check the page.",
    ],
  },
  {
    name: "Anything else, or your web designer",
    steps: [
      "Send your web designer the code with this note: \"Please put this Givezy donate button on our website.\"",
      "Already have a Donate button? Copy just the link instead and set it as that button's link.",
    ],
  },
];
