# Taste and process

What the owner taught us during the 2026 redesign: how good design is reached, and what reads as AI-made. This file is the **general layer**. It names no CoupleGoAI colour, screen or character, so it can be copied into another app's repository as it is. CoupleGoAI's own look is in [`brand.md`](brand.md).

Every rule here comes from the owner's own words, marks or decisions (dated 2026; quotes keep the owner's dictation; more in `docs/design/owner-taste-evidence.md`). Do not add taste the owner did not state. When a rule seems wrong for a task, ask the owner; do not quietly drop it.

## 1. Removing slop is not design

The first redesign pass (19 to 23 Nov) worked from an audit checklist: remove gradients, group elements, change the palette. The owner judged it "a bit boring" (21 Nov), then "the app has become even worse" (23 Nov), and named the cause: "you were trying to analyze a lot from the device, but you don't have reference". It had also removed a screen the owner loved.

So:
- A tells list ([`tells.md`](tells.md)) is a floor that catches mistakes. It never sets a direction and never proves a screen is good.
- Start visual work from references and the owner's marks (§ 5), not from a checklist. With no user feedback to go on, references stand in for users.
- Never remove a feature or a look the owner might like without showing what goes and asking first.
- Never grade your own work with your own rules. The owner, or an independent reviewer holding the owner's marks, judges it.
- Approving a token list in text is not approving a look. A palette approved in writing on 21 Nov was "awful" on the phone two days later: show it on a screen.
- Do not swap one trend for another (`tells.md` § Never swap one trend for another).

## 2. What the owner calls AI slop

Each of these was named by the owner. Treat them as findings in any app.

- **Cheap gradients**, above all on buttons and chips: "cheap gradients, cheap buttons. It doesn't look premium" (13 Nov); "No, the gradients is awful" (25 Nov).
- **Generated pictures:** "it seems like you used [...] Gemini or something to generate this, so they don't look real" (25 Nov). Ship drawn pictures; an image model may help explore, never ship.
- **Good-looking but generic.** Of seven of eight directions: "It looks like good apps, but just as an app" (23 Nov). A design must say at once what the app is about, or it fails however polished it is.
- **Childish, too many colours:** "Too many colors. Looks to childish" (23 Nov). Cute and happy are fine when drawn professionally; childish is not. Never bulky: slim and premium (23 Nov).
- **3D clip-art icons** next to a flat interface (23 and 24 Nov).
- **Halos and floor shadows** behind a figure: "It looks a bit tacky" (14 Nov).
- **Clutter:** "too many options, buttons views, looks like google docs" (23 Nov).
- **Pictures and icons that do not read:** a hand with four fingers, a key, rings that "look weird"; one picture for three meanings (25 Nov). One icon, one meaning, right at a glance.
- **Mixed families:** "we have things in a different style, even when it comes to rounding" (8 Nov). One style library, followed everywhere: "while we can do something crazy [...] we should be very unified" (20 Nov).
- **Another platform's look:** an icon or a website that feels like "material colors from Jetpack Compose" on iOS (25 Nov).
- **Too much text where a picture would do:** "There is too much text in it. It must be visual" (25 Nov).
- **In documents, decks and reports:** a line that only says what the thing is ("Founder pitch · November 2026"), `·` separators, badges, "AI bullets", over-explained text, a gradient with weak contrast: "this exactly what I call ai slop" (24 Nov); "no AI bullets or AI explained labels or badges, just normal report" (8 Nov).

## 3. Details that read as careless

- **Two of the same thing with no reason** (two circles where one would do): "I need either an explanation or maybe making it normal way" (25 Nov).
- **Seams** between parts that should be one piece (25 Nov).
- **Breaking a convention for no reason:** a week that starts on Thursday (25 Nov). Use the normal convention unless there is a reason.
- **A section title that repeats its component:** move it inside (8 Nov).
- **A dark outline between overlapping items:** a white or translucent edge instead (8 and 23 Nov).
- **Contrast that holds in one colour theme only:** a shape in the theme's own colour on a field of that colour disappears (25 Nov). Check every drawing in every theme.
- **Two background colours fighting** on one screen (25 Nov).
- **No way back:** every pushed screen, and any root the person reaches from elsewhere, has a Back that returns where they were; a big title in the top corner was disliked, a small centred one with the button beside it was chosen (25 Nov).
- **Uniform grids where real things vary:** pictures pinned up in real life come in two or three sizes and shapes, "not always square" (11 Nov).
- **A real object that does not look real:** a drawn object keeps the detail that makes it that object (25 Nov).
- **Colour that decorates instead of meaning something:** "why it's this color? [...] so it represents actually what kind of color you are?" (14 Nov). Pick colours by a colour rule, not by eye alone (23 and 24 Nov).
- **Something on a screen with no function** does not earn its place (25 Nov).
- **A dead end:** give the next step an accent (25 Nov).
- **A button that works before its field is filled:** disable it, or drop the field (25 Nov).

## 4. What the owner praises

- **Premium and Apple-like, without copying:** "aim for Apple-like design without copying them. [...] the same idea, but the figures should be different" (13 Nov).
- **Readable at a glance:** a scale must be "super intuitive when you look at each single point" (14 Nov); icons "should still be very easy to understand" (25 Nov).
- **A wow someone else notices:** seen on a friend's phone, "wow, what is that actually? [...] I want this" (25 Nov).
- **Creative, natural shapes and a crafted look:** research-board loves, "love the creative look" (Tolan, Finch, Headspace, Candle, Brilliant, Duolingo, Gentler Streak), "love the creative and natural shapes" (Monument Valley) (23 Nov).
- **Great plain UX:** Airbnb "just looks like perfect example of 'super good' UX"; Apple Books "very good UI and UX"; an answer that "opens in a separate view" (23 Nov).
- **Human marks over machine polish:** "we want to move away [...] from being perceived as AI app [...] boiling and hand-drawn elements are nice" (25 Nov). Rough and alive beats smooth: "in the prototype I liked them more because they were [...] more rough" (25 Nov). Not everything is drawn: a minimal, readable element stays minimal (25 Nov).
- **Material with depth, not gradients,** where a surface should feel like an object: grain, rich colour, small points of light, "it was just made professionally" (25 Nov, about home-screen widgets).

## 5. Motion

The owner wants an app "full of animations, full of fun, full of interactions" (23 Nov), and each animation "very simple, nice animations, nothing crazy" (25 Nov).

- **Believable:** liquid fills from the bottom; the card under a swiped card is there; a thing flying into a round shape lands round. The last frame must look intended (23 and 25 Nov).
- **A story animation is slow enough to read and smooth;** do not rush it (25 Nov). Launch animations are calm, not a big splash (23 Nov).
- **Small idle life is welcome** where the owner asked for it: things that drift a little, like objects on water (25 Nov).
- **Buggy or stiff motion is worse than none:** a flicker or a killed animation is a bug to fix before anything else (25 Nov).
- **Loved:** card-fan choreography, "very simple and proffessional, good choreogrpahy!" (23 Nov); two messages merging into one shape (23 Nov).
- Performance is measured on the slowest real phone at the end; Reduce Motion stays a floor.

## 6. Copy in designed screens

- **Short and direct:** no brackets, no quotes around words, no meta lines ("no need for text like (no account(", "why in quotes?", 25 Nov).
- **Facts as pictures,** fascinating rather than dry, without study details nobody reads ("nobody cares", 25 Nov).
- **No fears or claims the product does not make** (25 Nov).
- **Ask less:** do not ask what a sign-in provider already gives (25 Nov).
- **Value first, sign-up later:** let a person walk through the app and see what it gives before asking for an account (25 Nov).
- **Do not lead with "AI"** in a tagline (23 Nov).

## 7. The process that worked

The second redesign (23 to 26 Nov) reached a look the owner loved: "I really love it" (24 Nov). Its steps, in order:

1. **Research board.** Real screens from well-loved apps (about 109 screens from 36 apps) beside our own, on one page where the owner marks love or hate and leaves a note per screen. Work out *why* each loved screen works. Public App Store screenshots are a good source when a paid reference library is not available.
2. **Directions.** Several clearly different directions, each tied to the brand's core idea ("there should be some constraint [...] so that still in some way or another it can be connected"), each **clickable, "almost like use an app"**, never a still mock-up. Show old and new screens side by side for the whole app.
3. **Narrow by the owner's picks.** The owner keeps parts and mixes (8 directions, then 3, then 2, then 1 merged). Each round keeps what was loved and drops what was hated. When a new round is worse, restore the liked version and refine it (14 Nov).
4. **A full prototype before code.** Every screen and state, clickable, both themes. Once approved, **the prototype is the specification**: build it one to one (look, layout, copy, motion) and lose no existing feature. Lesson the agents drew (not the owner's words): before building, list what the prototype does not show and ask, because a liked detail it never drew was lost once (25 Nov).
5. **Build from the prototype.** Foundation first (tokens, kit), looked at, then screens. Compare each screen with its reference picture on a device. Keep a coverage list of every prototype screen and tick it only after looking. No device rebuilds while still prototyping: they cost time and power (25 Nov).
6. **Owner review, recorded verbatim.** The owner goes through the built app and dictates feedback. Write each item down in their words, with what you understood and where it lives, and build only when they say so (25 Nov).
7. **Choices before anything new and visible** (an icon system, a top bar, a widget set, an onboarding): show variants on a choices page (§ 8). For an icon system, show whole systems, not single icons. The owner picks, then build exactly that. "I expect you first to prototype and give me three variants [...] and then I choose one" (13 Nov).
8. **Walk it as a new user, then try to break it.** A fresh account, no shortcuts, every flow on two devices in every role the app has; then a QA pass with crazy inputs, offline, the largest text, dark mode, security and privacy (26 Nov). Fix as you go.

What did not work: breadth for its own sake. A round of fifteen prototypes by several agents was rejected outright (14 Nov); a better brief and a few strong variants beat many weak ones.

## 8. Showing the owner anything visual

- **The owner is visual:** "I'm a visual type of person, so you need to always build some kind of artifact where I can see what you propose" (23 Nov). Never describe a design only in words.
- **The choices page** ([`choices-page/`](choices-page/README.md)) is the standard: one tappable phone, variants A, B, C on the same screen, one line of text, one note field per screen. Keep earlier rounds reachable while a choice is open (13 Nov); remove what is decided (25 Nov).
- **Short and schematic:** "It's too much text to read for me. Can you maybe assume that I'm a little bit ADHD [...] and make it a bit more visual" (25 Nov). Lead with a picture or a box diagram.
- **Recommend, don't only ask:** "propose the fixes please! (Your refommended ones)" (26 Nov). One recommendation, at most a few one-line questions; make something, show it, ask, wait.
- **The agent owns the design:** "I'm no designer [...] it's completely your job now" (20 Nov). Push for creative ideas; when the first set is weak, propose more.
- **Publish pages; never leave a local preview open in the owner's browser.** Owner input lives on the live page.

## 9. Working rhythm

- **Plan first, then go** on the owner's word (25 and 26 Nov).
- **Finish whole things:** "I'm fed up with all these minor fixes" (23 Nov).
- **No review rounds after a build stands:** "Don't overreview it. Let me handle that. Just a small superficial review is enough and fixes in case something is broken" (24 Nov).
- **Independent critique for taste questions:** the owner asks for separate subagents "to think through and be unbiased" (25 Nov). Use them to critique, never to grade against your own rules.
- **Resumable work:** long visual work keeps a backlog file with its references, so a fresh session continues the same look.
- **An editable design source, never screenshots,** when the owner wants designs outside the code (26 Nov).
- **Brief, not script:** a prompt for a fresh session says what and why, not every step (19 Nov).
- **Watch the burn:** fewer agents at once, short reading lists, progress the owner can see (23 and 24 Nov).

## 10. Store and website pictures

- Real-looking accounts with real profile pictures; framed at the right proportions (16 Nov).
- Show what is worth showing off; leave out screens that are "not something to brag about" (16 Nov).

## 11. Using other design skills

The owner asked for the strongest design skills to be used ("you must utilize all these best skills out there, like Apple design, taste, impeccable", 23 Nov). Use them while researching and building directions. They never override the approved prototype, [`brand.md`](brand.md) or the owner's marks.
