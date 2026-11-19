// Demo course for `npm run seed`, modelled on the mockups: CSE 143, 12 lectures.
// Times are "mm:ss" from the start of the recording.

export interface DemoHotspot {
  concept: string;
  at: string; // when students start tapping
  students: number;
  spread?: number; // seconds over which they tap
  questions?: [string, number][];
  draft: string;
  status: "draft" | "published" | "dismissed";
  link?: [string, string];
}
export interface DemoLecture {
  title: string;
  date: string; // YYYY-MM-DD
  joined: number;
  lostShare: number; // students who tapped Lost at least once
  concepts: [string, string][]; // [name, start]
  lines: [string, string][];
  hotspots: DemoHotspot[];
}

const filler = (concepts: [string, string][], extra: Record<string, string[]> = {}): [string, string][] =>
  concepts.flatMap(([name, at]) => {
    const [m, s] = at.split(":").map(Number);
    const t = m * 60 + s;
    const said = extra[name] ?? [`Okay, next up: ${name.toLowerCase()}.`, `Here's the key idea behind ${name.toLowerCase()}, and then we'll do an example together.`, `Let's write that out on the board so you can see each step.`];
    return said.map((text, i): [string, string] => [`${Math.floor((t + i * 75) / 60)}:${String((t + i * 75) % 60).padStart(2, "0")}`, text]);
  });

export const LECTURES: DemoLecture[] = [
  {
    title: "Java review",
    date: "2026-10-16",
    joined: 90,
    lostShare: 0.22,
    concepts: [["Classes and objects", "0:30"], ["Arrays", "14:00"], ["ArrayList", "27:00"], ["Scanner and files", "39:00"]],
    lines: [],
    hotspots: [{ concept: "ArrayList", at: "29:10", students: 9, draft: "ArrayList grows by itself; an array has a fixed length. Use get(i) and set(i, x) instead of square brackets.", status: "published" }],
  },
  {
    title: "Testing and debugging",
    date: "2026-10-19",
    joined: 88,
    lostShare: 0.31,
    concepts: [["Unit tests", "0:40"], ["Assertions", "12:00"], ["Edge cases", "24:00"], ["Using the debugger", "36:00"]],
    lines: [],
    hotspots: [{ concept: "Edge cases", at: "25:30", students: 12, draft: "Edge cases are the smallest and strangest inputs: empty, one element, negative numbers. Test them first; that's where bugs live.", status: "published" }],
  },
  {
    title: "Exceptions",
    date: "2026-10-21",
    joined: 87,
    lostShare: 0.28,
    concepts: [["Throwing exceptions", "1:00"], ["Try and catch", "15:00"], ["Checked vs unchecked", "28:00"], ["Preconditions", "40:00"]],
    lines: [],
    hotspots: [{ concept: "Checked vs unchecked", at: "29:00", students: 10, draft: "Checked exceptions must be declared or caught (like IOException). Unchecked ones (like IllegalArgumentException) don't have to be.", status: "published" }],
  },
  {
    title: "Big-O and efficiency",
    date: "2026-10-23",
    joined: 89,
    lostShare: 0.35,
    concepts: [["Counting steps", "0:45"], ["Big-O notation", "13:00"], ["Growth rates", "26:00"], ["Comparing algorithms", "38:00"]],
    lines: [],
    hotspots: [{ concept: "Big-O notation", at: "15:20", students: 19, draft: "Big-O keeps only the fastest-growing term and drops constants: 3n² + 5n + 2 is O(n²). It describes how runtime grows, not exact time.", status: "published" }],
  },
  {
    title: "References and objects",
    date: "2026-10-26",
    joined: 86,
    lostShare: 0.4,
    concepts: [["Value vs reference", "0:30"], ["References and pointers", "12:30"], ["Null", "27:00"], ["Mutation through references", "37:00"]],
    lines: [],
    hotspots: [{ concept: "References and pointers", at: "14:10", students: 23, draft: "A variable holding an object stores a reference: the object's address. Two variables can point to the same object, so changing it through one shows up in the other.", status: "published" }],
  },
  {
    title: "Stacks",
    date: "2026-10-28",
    joined: 87,
    lostShare: 0.33,
    concepts: [["The stack ADT", "0:30"], ["Push and pop", "11:00"], ["Implementing with an array", "24:00"], ["Balanced brackets", "38:00"]],
    lines: [],
    hotspots: [{ concept: "Implementing with an array", at: "26:30", students: 14, draft: "The array holds the items and an int size tracks the top. Push writes at index size then adds one; pop subtracts one then reads.", status: "published" }],
  },
  {
    title: "Introduction to recursion",
    date: "2026-10-30",
    joined: 88,
    lostShare: 0.48,
    concepts: [["Thinking recursively", "0:40"], ["Base cases", "14:00"], ["Recursive case", "26:00"], ["Tracing calls", "37:00"]],
    lines: [],
    hotspots: [
      { concept: "Base cases", at: "15:40", students: 22, draft: "Every recursive method needs a base case: an input small enough to answer directly, without calling itself again.", status: "published" },
      { concept: "Tracing calls", at: "38:30", students: 13, draft: "To trace recursion, write each call on its own line, indented, and fill in the return values from the bottom up.", status: "published" },
    ],
  },
  {
    title: "Interfaces",
    date: "2026-11-02",
    joined: 85,
    lostShare: 0.44,
    concepts: [["Why interfaces", "0:30"], ["Interfaces vs classes", "10:30"], ["Implementing an interface", "22:00"], ["Big-O of list operations", "35:00"]],
    lines: [],
    hotspots: [
      { concept: "Interfaces vs classes", at: "12:10", students: 14, draft: "An interface lists methods a class promises to have, with no code. A class provides the code. List is an interface; ArrayList is a class that implements it.", status: "published" },
      { concept: "Big-O notation", at: "36:40", students: 18, draft: "Adding at the end of an ArrayList is O(1) most of the time; adding at the front is O(n) because every element shifts over.", status: "published" },
      { concept: "Implementing an interface", at: "24:00", students: 9, draft: "Write 'implements Shape' after the class name, then write every method the interface lists.", status: "dismissed" },
    ],
  },
  {
    title: "Stacks and queues",
    date: "2026-11-04",
    joined: 79,
    lostShare: 0.17,
    concepts: [["Queues", "0:40"], ["Stack vs queue", "13:00"], ["Using a queue", "26:00"], ["Mixing stacks and queues", "38:00"]],
    lines: [],
    hotspots: [{ concept: "Mixing stacks and queues", at: "39:20", students: 9, draft: "To reverse a queue, move everything into a stack, then back: the stack flips the order.", status: "published" }],
  },
  {
    title: "Linked lists I",
    date: "2026-11-06",
    joined: 88,
    lostShare: 0.61,
    concepts: [["Nodes", "0:30"], ["References and pointers", "9:00"], ["Building a list", "20:00"], ["Traversing a list", "31:00"], ["Changing a list", "42:00"]],
    lines: [],
    hotspots: [
      { concept: "References and pointers", at: "10:40", students: 24, draft: "list.next is a reference to the next node, not the node itself. Writing list.next = temp changes which node the arrow points to.", status: "published" },
      { concept: "Building a list", at: "22:30", students: 15, draft: "Build a list from the back: make the last node first, then make each new node point to the one you already have.", status: "published" },
      { concept: "Traversing a list", at: "32:40", students: 17, draft: "Walk the list with a separate variable: current = current.next. Never move front itself, or you lose the start of the list.", status: "published" },
      { concept: "Changing a list", at: "44:00", students: 12, draft: "To change a list you must stop at the node before the change, because only it holds the arrow you need to rewrite.", status: "published" },
    ],
  },
  {
    title: "Linked lists II",
    date: "2026-11-09",
    joined: 81,
    lostShare: 0.38,
    concepts: [["Adding at the front", "0:40"], ["References and pointers", "11:00"], ["Adding in the middle", "20:00"], ["Removing a node", "30:00"], ["Dummy head nodes", "41:00"]],
    lines: [],
    hotspots: [
      { concept: "Removing a node", at: "30:40", students: 22, draft: "To remove a node, point the node before it at the node after it. Keep a reference to the previous node as you walk the list, because a singly linked list cannot go backwards.", status: "published", link: ["https://example.com/removing-a-node", "Removing a node, drawn step by step · 3 min"] },
      { concept: "Dummy head nodes", at: "41:15", students: 13, draft: "A dummy head is an empty first node. With it, removing the first real node is the same code as removing any other, so there is no special case.", status: "draft" },
    ],
  },
  {
    title: "Recursion and the call stack",
    date: "2026-11-11",
    joined: 84,
    lostShare: 0.52,
    concepts: [["Recursion review", "0:20"], ["Stack frames", "5:30"], ["Call stack order", "13:00"], ["Base cases", "19:30"], ["Recursive case", "26:00"], ["Memoization", "33:00"]],
    lines: [
      ["0:20", "Okay everyone, let's get going. Today is recursion again, but this time we look at what actually happens inside the computer."],
      ["1:10", "Last time we wrote factorial. Factorial of n is n times factorial of n minus one. That looked like magic to a lot of you."],
      ["2:30", "The magic goes away once you see the call stack. So that's the plan: stack frames, then the order calls happen in, then base cases."],
      ["5:30", "When you call a method, Java makes a stack frame for it. A frame is a little box of memory for that one call."],
      ["6:20", "The frame holds that call's parameters and its local variables. Nothing else can see them."],
      ["7:15", "Here's the important part. When factorial calls factorial, that's a brand new frame, with its own copy of n."],
      ["8:00", "So there isn't one n. There's an n for every call that hasn't finished yet. Three calls deep, three different n's."],
      ["8:50", "Each frame sits on top of the one that called it. That's why we call it a stack: the newest frame is on top."],
      ["10:10", "Let me draw it. factorial of three makes a frame with n equals three. It calls factorial of two: new frame on top, n equals two."],
      ["11:40", "And factorial of two calls factorial of one. Now we have three frames stacked up, each one waiting."],
      ["13:00", "Now the order. Calls go on the stack in the order they're made, but they finish in the reverse order."],
      ["14:05", "The last call made is the first one to finish. Last in, first out, just like the stacks we built two weeks ago."],
      ["15:20", "So factorial of one finishes first, returns one, and its frame is thrown away. Then factorial of two can finish."],
      ["16:30", "Factorial of two was waiting on that answer. It multiplies two by one, returns two, and its frame goes away."],
      ["17:45", "Finally factorial of three gets two back, multiplies by three, and returns six. The stack is empty again."],
      ["19:30", "Now, why did it stop at one? Why didn't factorial of one call factorial of zero, and zero call minus one, forever?"],
      ["20:58", "So factorial of n is n times factorial of n minus one. That is the recursive case."],
      ["21:30", "The function calls itself with n minus one, and keeps doing that until it hits the base case, which is what stops the whole thing from unwinding forever."],
      ["22:14", "For factorial the base case is zero. Factorial of zero is one, no further call."],
      ["22:51", "Let me draw the frames on the board so you can see them stack up."],
      ["23:40", "Without a base case you get a stack overflow. The stack runs out of room because frames keep piling on and none ever finish."],
      ["24:50", "Every recursive call has to move towards the base case. Smaller n, shorter list, smaller part of the array."],
      ["26:00", "Now the recursive case. This is where you trust the recursion: assume the smaller call already works."],
      ["27:20", "For sum of a list, the recursive case is the first element plus the sum of the rest."],
      ["28:45", "You don't trace every call in your head. You check the base case, check one step, and trust the rest."],
      ["30:10", "Let's do one together: counting down. Print n, then call countdown of n minus one. Base case is when n is zero."],
      ["31:40", "Notice what happens if I print after the recursive call instead of before. The numbers come out in reverse order. Why? The call stack."],
      ["33:00", "Last topic: memoization. Fibonacci with plain recursion calls itself twice each time, and it gets slow very fast."],
      ["34:20", "Fibonacci of thirty makes over a million calls, and most of them compute the same values again and again."],
      ["35:30", "Memoization means: remember answers you've already computed. Keep a map from n to fib of n."],
      ["36:40", "Before computing, check the map. If the answer is there, return it. If not, compute it, store it, then return it."],
      ["37:30", "That turns an exponential number of calls into a linear number. Same recursion, one extra map."],
      ["39:00", "The base cases don't change. Memoization only skips repeated work in the recursive case."],
      ["41:00", "We'll do more of this on Friday. For the homework, think about what each frame holds when you trace your code."],
      ["43:30", "Quick reminder that the midterm covers everything up to and including today's lecture."],
      ["45:00", "Okay, questions? Come down to the front, or ask in the app after class. See you Friday."],
    ],
    hotspots: [
      {
        concept: "Base cases",
        at: "21:35",
        students: 26,
        spread: 80,
        questions: [["How do I know what the base case should be?", 11], ["Why doesn't it loop forever?", 8], ["Can there be more than one base case?", 4]],
        draft: "The base case is the smallest input, answered directly with no further call. Every recursive call must move towards it. To find it, ask: what is the simplest input I can answer without recursing?",
        status: "draft",
      },
      {
        concept: "Memoization",
        at: "36:45",
        students: 12,
        spread: 60,
        questions: [["Where does the map go: inside the method or outside?", 5], ["Is memoization the same as caching?", 3]],
        draft: "Memoization stores each answer the first time you compute it, so repeated calls return straight from the map instead of recursing again. The base cases stay the same.",
        status: "draft",
      },
      {
        concept: "Stack frames",
        at: "7:55",
        students: 11,
        spread: 60,
        questions: [["Why does each call get its own copy of the variables?", 6], ["Where are the frames stored?", 2]],
        draft: "Each call gets its own frame with its own variables. Frames stack up, then unwind in reverse order.",
        status: "draft",
      },
    ],
  },
];

for (const L of LECTURES) if (!L.lines.length) L.lines = filler(L.concepts);

/** The demo student's own Lost moments, with what they asked and the tutor's answers. */
export const MY_MOMENTS: { lecture: number; at: string; status: "got_it" | "fuzzy" | "open"; answer: string; followups?: [string, string][] }[] = [
  {
    lecture: 12,
    at: "8:41",
    status: "got_it",
    answer: "[[stack frames]]\nEach call gets its own frame with its own copy of the variables. So factorial(3) and factorial(2) each have their own n, sitting in separate frames on the stack.\nExample: Three calls deep means three frames, with n = 3, 2 and 1.",
    followups: [["Why its own copy of variables?", "Because each call is still waiting to finish its own work. If they shared one n, the inner call would overwrite the value the outer call still needs when it resumes."]],
  },
  {
    lecture: 12,
    at: "15:20",
    status: "got_it",
    answer: "[[call stack order]]\nCalls stack up, then return in reverse: last called, first finished. factorial(1) returns first, then factorial(2), then factorial(3).",
  },
  {
    lecture: 12,
    at: "22:03",
    status: "fuzzy",
    answer: "[[base cases]]\nA base case is where the recursion stops. Each call makes the problem smaller. The base case is the smallest version, answered directly with no further call. Without it the function calls itself forever.\nExample: In factorial(n), the base case is n = 0, which returns 1.",
    followups: [["How do I pick the base case?", "Ask: what's the smallest input I can answer without recursing? For a list that's usually the empty list; for a number, often 0 or 1. Then check that every recursive call moves towards it."]],
  },
  {
    lecture: 11,
    at: "31:12",
    status: "fuzzy",
    answer: "[[removing a node]]\nTo remove a node, change the arrow of the node before it so it skips over it. You need to stop at the previous node, because a singly linked list can't go backwards.",
  },
  {
    lecture: 11,
    at: "12:05",
    status: "got_it",
    answer: "[[references and pointers]]\nfront.next is a reference: an arrow to the next node. Assigning to it changes where the arrow points, not the node itself.",
  },
  {
    lecture: 10,
    at: "10:55",
    status: "got_it",
    answer: "[[references and pointers]]\nA node's next field holds a reference to another node. Following .next moves you along the arrows.",
  },
  {
    lecture: 8,
    at: "12:30",
    status: "got_it",
    answer: "[[interfaces vs classes]]\nAn interface is a list of methods a class promises to have. The class supplies the code. List is the interface; ArrayList is one class that implements it.",
  },
  {
    lecture: 7,
    at: "16:00",
    status: "open",
    answer: "[[base cases]]\nThe base case is the input small enough to answer directly. Here it's n == 0, which returns 1 without another call.",
  },
];
