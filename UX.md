# UX specification — how Muster must feel

This document specifies **feel**, not behaviour. `SPEC.md` says what each screen does.
This says what the product must be like to use. The two are read together.

The audience is the **majority of users**. A player holds a phone at a table. A player
opens a laptop on a desk. This document does not optimise for assistive technology. The
accessibility work already in the code stays. It does not constrain the decisions below.

---

## 1. How to read this document

The language is **ASD-STE100 at about 75 percent**. The structural rules are kept. The
approved dictionary is not.

**Kept:**

- One sentence states one idea.
- Sentences are 20 words or fewer.
- Verbs are active and present tense.
- A noun cluster is three words or fewer.
- A term in section 2 has one meaning in this document.

**Dropped:**

- The approved word list. This document uses domain words: *datacard*, *roster*, *turning point*.
- The procedure and description text-type split. This document is one type.

The reason to stop at 75 percent is in section 9.

**Normative words are RFC 2119**, capitalised: MUST, MUST NOT, SHOULD, MAY.

---

## 2. Fixed terms

Each term below has one meaning in this document. Each one is testable.

| Term | Means | Not |
|---|---|---|
| `immediate` | The screen changes within 100 ms of an input. | `fast`, `responsive` |
| `glanceable` | A user reads one fact in under one second, at arm's length. | `clear`, `simple` |
| `calm` | The screen shows nothing the task does not need. | `empty`, `minimal` |
| `confident` | The user knows the place, the state, and the next step. | `obvious`, `intuitive` |
| `substantial` | The surface looks made by a person, not generated. | `polished`, `pretty` |
| `inviting` | The screen makes a user want to look further. | `fun`, `engaging` |
| `forgiving` | One action undoes a mistake. | `safe`, `robust` |
| `mode` | One of the three contexts in section 3. | `screen`, `page`, `view` |
| `surface` | Everything a user sees at one moment. | `UI`, `layout` |

A word outside this table carries its ordinary meaning.

---

## 3. The three modes

Feel is not one target. Users reach for the same product in three ways. Each way wants a
different thing first.

### Table mode

The user holds a phone. One hand. A game is in progress. The room is loud. The user
looks for two seconds, then looks away.

The battle screen is table mode. Nothing else is.

Table mode wants `glanceable` first. Beauty comes second here, and only here.

### Browse mode

The user explores. There is no goal. The device is either one. The user has time.

The catalogs, a datacard, and a team page are browse mode.

Browse mode wants `inviting` first. This is where a new user decides to stay.

### Build mode

The user constructs a roster or an army. The work is deliberate. The device is usually a
computer. A mistake costs real time.

Roster building, army building, and the inventory are build mode.

Build mode wants `confident` first.

---

## 4. The seven targets

Each target states what the product MUST feel like. Each one carries an **observable
sign**, so the testing loop can score it. Each one carries a **failure**, so a defect is
recognisable.

### 4.1 Immediate

The product MUST answer every input before the network answers.

- **Sign.** A tap or a click changes the surface within 100 ms.
- **Sign.** A control that waits on a server shows that it is working, in place.
- **Fails when.** A control looks dead until a response arrives.
- **Fails when.** The surface jumps after data loads.

A user forgives a slow server. A user does not forgive a dead button.

### 4.2 Glanceable

The facts a user needs MUST be readable in one look.

- **Sign.** In table mode, wounds, order, and activation read at arm's length.
- **Sign.** A number is larger than its own label.
- **Fails when.** A fact needs a scroll to read.
- **Fails when.** A fact needs a tap to read.

In table mode this target beats every other target. A player who looks down for five
seconds has lost their turn.

### 4.3 Calm

The surface MUST show only what the mode needs.

- **Sign.** One accent colour is active on a surface at one time.
- **Sign.** Motion starts only after an input.
- **Fails when.** Two elements compete for the same attention.
- **Fails when.** Something moves that the user did not cause.

Calm is what makes a dense screen usable. It is not the same as empty.

### 4.4 Confident

The user MUST always know three things: the place, the state, and the next step.

- **Sign.** Every surface names itself in its first line.
- **Sign.** Every surface offers one action that is clearly the main one.
- **Sign.** A surface that can be left shows the way back.
- **Fails when.** A surface is a dead end.
- **Fails when.** Two actions look equally important.

### 4.5 Substantial

The surface MUST look considered.

- **Sign.** Type, spacing, and rules follow one grid.
- **Sign.** Edges align across neighbouring blocks.
- **Sign.** Text has room. Lines are 45 to 75 characters in browse mode.
- **Fails when.** Gaps between similar blocks differ without a reason.
- **Fails when.** A control uses a browser default style.

This target is what separates a product from a prototype. A user cannot name it. A user
always feels it.

### 4.6 Inviting

The first surface a user sees MUST make them want a second one.

- **Sign.** The entry screen shows content, not a form.
- **Sign.** A list shows enough of each item to make one item interesting.
- **Sign.** A user with no data still sees what the product is for.
- **Fails when.** An empty state is the first impression.
- **Fails when.** A list reads as rows of identical text.

This is the target that earns a second session.

### 4.7 Forgiving

A mistake MUST cost one action.

- **Sign.** A destructive action asks once, and names what it destroys.
- **Sign.** A value the user typed survives an error.
- **Fails when.** Data disappears with no notice.
- **Fails when.** An error clears the form.

---

## 5. Priority when targets conflict

Targets conflict. `glanceable` wants large type. `substantial` wants generous space.
Both cannot win on a phone.

The mode decides. The first target in each row wins.

| Mode | Priority order |
|---|---|
| Table | glanceable → immediate → forgiving → calm → confident → substantial → inviting |
| Browse | inviting → substantial → calm → immediate → confident → glanceable → forgiving |
| Build | confident → forgiving → substantial → immediate → calm → glanceable → inviting |

A change MUST NOT lower a higher target to raise a lower one in the same mode.

---

## 6. Identity

Muster looks like a printed catalogue, not a dashboard. This is an asset. It MUST
survive every change below.

The product MUST keep:

- Paper and ink. A light ground. Dark text.
- A serif for headings. A monospace for labels. A sans for body text.
- Hairline rules instead of boxes.
- Flat surfaces.
- Generous outer margins.

The product MUST NOT adopt:

- Gradients.
- Drop shadows that imitate depth.
- Brand colour used for decoration.
- Icons that replace a word the user can read.

A user SHOULD feel that someone typeset the product. A user SHOULD NOT feel that someone
assembled it from a component library.

---

## 7. Phone and computer

The same product. Two shapes. The difference is **density**, not **content**.

### Phone

- One column.
- The main action sits in the lower half of the screen.
- Chrome moves out of the way as the user reads.
- A touch target is 44 px or larger.
- A screen MUST NOT scroll sideways.

### Computer

- Two columns where the content supports it.
- Hover MAY reveal a secondary detail. Hover MUST NOT reveal a primary one.
- More density is correct here. A desktop user scans, then reads.
- A keyboard path exists for every frequent action.

A computer surface MUST NOT be a stretched phone surface. A phone surface MUST NOT be a
hidden desktop surface.

---

## 8. Out of scope

This document does not specify:

- Behaviour, routes, or data. `SPEC.md` holds those.
- Component APIs. `ARCHITECTURE.md` holds those.
- Accessibility conformance. `ROADMAP.md` A1 holds that.
- Brand, logo, or marketing copy.

---

## 9. Why 75 percent, and not 100

Full ASD-STE100 needs the approved dictionary. The dictionary costs a writer a lookup on
every sentence. It pays back when a reader cannot assume any word is ordinary.

This document has one reader who is not a person: the agent that iterates on the UI. That
reader needs **terms that do not drift** and **sentences it cannot parse two ways**.
Section 2 and the structural rules give it both.

The dictionary would add little. The structure carries most of the benefit. This is the
70-to-80 percent point.

This document states the risk plainly. A reader MUST NOT assume that a word outside
section 2 is controlled.

---

## 10. How this is tested

Section 4 gives each target an observable sign. A testing loop MUST turn those signs into
a score per surface, per mode, and per viewport. That loop is **not built yet**. It will be
recorded as `ROADMAP.md` U1 when it is.

A score is evidence, not a verdict. A machine measures the signs. A person decides
whether the result is good.
