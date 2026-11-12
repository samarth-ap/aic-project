// Demo lectures for seeding. Each line is [seconds, text]. Confusion spikes are
// [seconds, studentsWhoTap, kind-mix] and are deliberately placed a little AFTER
// the hard part, the way real students react.

export interface DemoLecture {
  title: string;
  daysAgo: number;
  students: number;
  lines: [number, string][];
  spikes: { at: number; students: number; spread: number; kinds?: ("lost" | "too_fast" | "example")[] }[];
  questions: [number, string][];
}

export const COURSE = "MATH 208";

export const LECTURES: DemoLecture[] = [
  {
    title: "Lecture 6: Linear transformations",
    daysAgo: 7,
    students: 42,
    lines: [
      [0, "Alright, let's get started. Today is all about linear transformations."],
      [12, "A transformation T from R n to R m is linear if T of u plus v equals T u plus T v, and T of c u equals c times T u."],
      [40, "The key fact: every linear transformation from R n to R m is just multiplication by some matrix A."],
      [70, "To find that matrix, you apply T to each standard basis vector e one through e n and use those as the columns."],
      [110, "So the columns of A are T of e1, T of e2, and so on. That's the standard matrix."],
      [150, "Let's do rotation by theta in R2. T of e1 is cos theta, sin theta. T of e2 is minus sin theta, cos theta."],
      [200, "Now a quick one: is T of x equals x plus one linear? No, because T of zero is not zero."],
      [240, "Next, composition. If you do S after T, the matrix is the product B times A — note the order, B times A, not A times B."],
      [290, "This is why matrix multiplication is defined the way it is. It's composition of functions, read right to left."],
      [340, "Order matters: rotating then reflecting is not the same as reflecting then rotating."],
      [400, "Finally, one-to-one and onto. T is one-to-one if the columns of A are linearly independent."],
      [440, "T is onto if the columns of A span R m, which means a pivot in every row."],
      [490, "That's it for today. Next time, we'll start on determinants."],
    ],
    spikes: [
      { at: 275, students: 9, spread: 40, kinds: ["lost", "lost", "too_fast"] },
      { at: 460, students: 5, spread: 30, kinds: ["lost", "example"] },
    ],
    questions: [
      [300, "why is it B times A and not A times B if S is applied second?"],
      [470, "how do you check for a pivot in every row quickly?"],
    ],
  },
  {
    title: "Lecture 7: Change of basis & diagonalization",
    daysAgo: 0,
    students: 48,
    lines: [
      [0, "Okay everyone, today we connect eigenvectors to something really useful: diagonalization."],
      [15, "Quick review: an eigenvector v of A satisfies A v equals lambda v. The direction doesn't change, only the length."],
      [45, "We find eigenvalues by solving the determinant of A minus lambda I equals zero."],
      [80, "Now, coordinates. Any basis B of R n gives you a coordinate system. The coordinate vector of x relative to B is written x sub B."],
      [115, "If P is the matrix whose columns are the basis vectors, then x equals P times x sub B. So x sub B is P inverse x."],
      [150, "P converts from B coordinates to standard coordinates, and P inverse goes the other way. People mix these up constantly."],
      [185, "Let's skip the worked example since we're short on time — it's in section 4.4."],
      [200, "Here's the big idea. Suppose A has n linearly independent eigenvectors. Put them in the columns of P."],
      [235, "Then A equals P D P inverse, where D is diagonal with the eigenvalues on the diagonal."],
      [270, "Read it right to left: P inverse changes into eigenvector coordinates, D just scales each coordinate, and P changes back."],
      [310, "So in the eigenvector basis, the transformation is just stretching along each axis. That's why diagonal matrices are easy."],
      [350, "Why do we care? Powers. A to the k equals P D to the k P inverse, and D to the k is trivial — raise each diagonal entry to k."],
      [400, "Example: Fibonacci. The matrix 1 1 1 0 has eigenvalues phi and one minus phi, so you get a closed form for the nth Fibonacci number."],
      [450, "Not every matrix is diagonalizable. You need n independent eigenvectors. A repeated eigenvalue might not give enough."],
      [490, "Classic example: the shear matrix 1 1 0 1. Eigenvalue one, repeated, but only one independent eigenvector. Not diagonalizable."],
      [530, "For homework, problems 5.3 numbers 1 through 12. See you Wednesday."],
    ],
    spikes: [
      { at: 170, students: 8, spread: 35, kinds: ["lost", "lost", "example"] },
      { at: 290, students: 16, spread: 45, kinds: ["lost", "lost", "lost", "too_fast"] },
      { at: 505, students: 6, spread: 25, kinds: ["lost", "example"] },
    ],
    questions: [
      [160, "wait which one goes from B coordinates to standard, P or P inverse?"],
      [295, "why is it P D P inverse and not P inverse D P?"],
      [300, "can you explain the right to left thing again"],
      [310, "what does 'changes into eigenvector coordinates' actually mean"],
      [515, "how do you know there's only one eigenvector for the shear matrix?"],
    ],
  },
];
