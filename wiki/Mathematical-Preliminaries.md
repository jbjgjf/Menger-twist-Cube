# 1. Mathematical Preliminaries

## 1.1 Sets, Maps, and Permutations

A map from a set $X$ to a set $Y$ is written $f:X\to Y$. When every $y\in Y$ is the image of exactly one $x\in X$, $f$ is a bijection. An operation that rearranges a finite collection of pieces is a bijection from the set of piece locations to itself—that is, a **permutation**.

The composition of applying $f$ followed by $g$ is written $gf$. Every bijection has an inverse map $f^{-1}$ satisfying $f^{-1}f=ff^{-1}=1$, where $1$ denotes the identity map that leaves every element unchanged.

For example, the permutation that maps

$$
a\mapsto b,\qquad b\mapsto c,\qquad c\mapsto a
$$

and leaves all other elements fixed is written $(a\ b\ c)$ and is called a **3-cycle**.

A permutation that swaps only two elements is called a **transposition**. Every finite permutation can be written as a product of transpositions, and the parity (even or odd) of the number of transpositions required is invariant under the choice of decomposition. A permutation is an **even permutation** if it can be written as a product of an even number of transpositions, and an **odd permutation** if it requires an odd number. Since a cycle of length $k$ can be written as a product of $k-1$ transpositions, a 3-cycle is even and a 4-cycle is odd.

Defining the sign of a permutation $\pi$ as $\operatorname{sgn}(\pi)=+1$ (even) or $-1$ (odd), the multiplicative property

$$
\operatorname{sgn}(\pi\sigma)=\operatorname{sgn}(\pi)\operatorname{sgn}(\sigma)
$$

holds.

## 1.2 Groups

Composing two permutations on the same set yields another permutation, and the set of permutations is closed under taking the identity and inverses. A set equipped with an operation satisfying associativity, the existence of an identity element, and the existence of inverse elements is called a **group**.

The group of all permutations on $m$ points is denoted $\operatorname{Sym}(m)$ (the symmetric group), and the subgroup consisting of all even permutations is denoted $\operatorname{Alt}(m)$ (the alternating group). In this document, their significance is as follows:

- All operations obtainable by composing legal moves of the puzzle form a group.
- We investigate to what extent that group can permute a given subset of positions.
- If the induced group on an $m$-element set contains $\operatorname{Alt}(m)$, then every even permutation on that set can be realized.

## 1.3 Group Actions and Orbits

When each element of a group $G$ acts as a permutation of a set $X$, we say that $G$ **acts** on $X$. The **orbit** of a point $x\in X$ is defined as

$$
Gx=\{g(x)\mid g\in G\}
$$

This is the set of all locations that $x$ can reach via legal move sequences.

### Small Example

If $X=\{1,2,3,4,5,6\}$ and the only available operations are $(1\ 2\ 3)$ and $(4\ 5)$, then the orbits are

$$
\{1,2,3\},\qquad \{4,5\},\qquad \{6\}
$$

Piece 1 can never move to position 4. Any solver must therefore handle each orbit as an invariant set.

A **class** is a coarse partition defined by transparent coordinate invariants (such as digit types). An **orbit** is the exact set of positions mutually reachable via legal moves. A single coordinate class may split into multiple orbits.

## 1.4 Commutators and Conjugation

The **commutator** of two operations $A$ and $B$ is defined as

$$
[A,B]=ABA^{-1}B^{-1}
$$

If $A$ and $B$ commute, their commutator is the identity operation. By choosing two operations that fail to commute only on a small overlapping region, almost all of their actions cancel out, leaving only a small number of pieces moved.

The **conjugate** of an operation $T$ by $U$ is $UTU^{-1}$. Intuitively, $U^{-1}$ (or $U$, depending on left/right convention; here $UTU^{-1}$ applies $U^{-1}$ first to the point $x$) moves target pieces into the working support of $T$, $T$ performs the local modification, and $U$ restores the surrounding pieces back to their original locations.

**Lemma 1 (Parity of a Commutator).** For any permutations $A,B$ on a finite set, $[A,B]$ is an even permutation.

**Proof.**

$$
\operatorname{sgn}([A,B])
=\operatorname{sgn}(A)^2\operatorname{sgn}(B)^2=1.
$$

Hence $[A,B]$ is even. $\square$

**Lemma 2 (Transport of Support under Conjugation).** If $T$ fixes all points outside a subset $S$, then $UTU^{-1}$ fixes all points outside $U(S)$.

**Proof.** If $x\notin U(S)$, then $U^{-1}(x)\notin S$, so $T(U^{-1}(x))=U^{-1}(x)$. Consequently, $UTU^{-1}(x)=x$. $\square$

## 1.5 Linear Algebra over $\{0,1\}$

Over the two-element field $\mathbf F_2=\{0,1\}$, addition satisfies $1+1=0$. Arithmetic over $\mathbf F_2$ tracks parity (even vs. odd).

When there are $r$ orbits, the parities of the induced permutations on each orbit are represented by a vector

$$
v=(v_1,\ldots,v_r)\in\mathbf F_2^r
$$

If the parity effect of an atomic move $g_j$ is represented by the column vector $a_j\in\mathbf F_2^r$, then the indicator variables $x_j\in\mathbf F_2$ for whether to apply each move once must satisfy

$$
a_1x_1+\cdots+a_kx_k=v
$$

This system of linear equations over $\mathbf F_2$ can be solved by standard Gaussian elimination.

## 1.6 Breadth-First Search and Termination

Exploring a finite graph from a starting vertex in order of edge distance 1, 2, 3, and so on is called **breadth-first search (BFS)**. When executed without an artificial depth cutoff, BFS is guaranteed to find a shortest path to any reachable vertex, or to certify unreachability after exhausting the finite connected component. Imposing a heuristic cutoff such as "search up to depth 20" invalidates a proof of completeness.

A second method for proving termination is to define a non-negative integer potential $\Phi\in\mathbf Z_{\ge0}$ for each state and prove that each step strictly decreases it: $\Phi_{\mathrm{new}}<\Phi_{\mathrm{old}}$. Because a non-negative integer cannot decrease infinitely many times, the process must terminate in finitely many steps.

## 1.7 Computer-Assisted Proofs

In this document, a proof that exhaustively enumerates a finite—though potentially large—case analysis by computer program is called a **computer-assisted proof**. We strictly distinguish such proofs from empirical successes on random scrambles. Wherever a computer-assisted proof is invoked, we explicitly specify the finite input domain, the property verified, the saved certificate, the independent verification procedure, and the mathematical proposition deduced from it.
