# 2. Strict Definition of Rotation Moves and Comparison of Levels 2 and 3

## 2.1 Set of Positions

At Level $n$, the side length of the integer grid is $3^n$, and the integer coordinate range from the center to the outer boundary is $e_n=(3^n-1)/2$. Every grid position can be written uniquely in signed ternary digits as

$$
p=\sum_{j=0}^{n-1}3^j d_j,qquad d_j\in\{-1,0,1\}^3
$$

Let $z(d)$ denote the number of zero components of a digit vector $d\in\{-1,0,1\}^3$. The Menger sponge position set at Level $n$ is defined by

$$
P_n=\{p:z(d_j)\le1\text{ for every }j\}
$$

For each digit, there are 8 admissible vectors with no zero components and 12 admissible vectors with exactly one zero component, yielding 20 admissible digits per level:

$$
|P_n|=20^n,qquad |P_2|=400,quad |P_3|=8000.
$$

We write $p=3b+o$ for Level 2 and $p=9B+3b+o$ for Level 3.

## 2.2 Orientations and States

The group of orientation-preserving cube rotations that preserve the integer lattice $\mathbf Z^3$ is

$$
C=SO(3,\mathbf Z)
$$

This group consists of the $3\times3$ orthogonal matrices with entries in $\{0,\pm1\}$ and determinant $1$, and has order $|C|=24$.

Each cell is identified by its solved (home) position $x\in P_n$. A puzzle state is represented by a pair $(\sigma,\rho)$, where $\sigma:P_n\to P_n$ gives the current position of cell $x$, and $\rho:P_n\to C$ gives its current orientation. The solved state is given by $\sigma=1$ and $\rho(x)=I$ for all $x\in P_n$.

## 2.3 Atomic Moves

A pair consisting of a single rotation target and a rotation angle $\theta\in\{90^\circ,-90^\circ,180^\circ\}$ is called an **atomic move**. Given a rotation axis $a$, a pivot point $c$ on the axis, and a target cell subset $D\subset P_n$, the move acts on positions in $D$ by

$$
p\longmapsto c+R_{a,\theta}(p-c)
$$

and updates the orientation of each moved cell by left-multiplying by $R_{a,\theta}$.

## 2.4 Move Families

**Frame Rotations.** Choose a thick layer of scale $s=3^q$. Along the X-axis, for an interval $[L,L+s-1]$, the target subset is

$$
D=\{p\in P_n:L\le p_x\le L+s-1\}.
$$

**Recursive Extension Rotations.** Among the 20 child sub-blocks of each parent block, the 12 child sub-blocks whose local digit has exactly one zero component are called **edge-type child blocks**. A depth-$d$ **extension** rotates an entire edge-type child block at depth $d$ around the axis of its zero component. A depth-$(d+\tfrac12)$ **slab** rotates one of the three thin slices obtained by subdividing that edge-type child block along its rotation axis.

In Level 3, a depth-1 extension rotates a $9\times9\times9$ sub-block, a depth-2 extension rotates a $3\times3\times3$ sub-block, and a depth-3 extension rotates a single $1\times1\times1$ cell (a single-cell roll).

## 2.5 Geometric Legality

A candidate rotation is not guaranteed to be physically legal merely because its endpoints land back on the Menger lattice. Modeling each cell as a closed unit cube, we prohibit positive-volume interior overlap during the continuous rotation, permitting only boundary contact. Letting $B_D$ denote the union of cubes in the rotating target $D$ and $B_K$ denote the union of fixed cubes $K=P_n\setminus D$, physical legality is defined by the condition

$$
\bigcup_{0<t<1}R_{a,t\theta}(\operatorname{int}B_D)
\cap\operatorname{int}B_K=\varnothing
$$

The implementation checks outer bounding geometry, endpoint closure in $P_n$, and continuous-rotation swept-volume intersection in sequence.

## 2.6 Comparison of Levels 2 and 3

In the table below, "Targets" counts the distinct geometric rotation regions, while "Atomic moves" counts the three non-zero rotation angles ($\pm90^\circ,180^\circ$) separately.

| family | L2 candidates | L2 legal | L3 candidates | L3 legal | Description |
| --- | ---: | ---: | ---: | ---: | --- |
| frame scale 1 | 27 | 27 | 81 | 81 | 1-cell-thick slice layer |
| frame scale 3 | 9 | 9 | 27 | 27 | 3-cell-thick slice layer |
| frame scale 9 | — | — | 9 | 9 | 9-cell-thick slice layer |
| extension depth 1 | 12 | 12 | 12 | 12 | Outermost edge sub-block |
| slab depth 1.5 | 36 | 36 | 36 | 36 | Thin slab of depth-1 edge block |
| extension depth 2 | 240 | 72 | 240 | 72 | Single cell in L2; intermediate block in L3 |
| slab depth 2.5 | — | — | 720 | 216 | Thin slab of intermediate block |
| extension depth 3 | — | — | 4,800 | 744 | Single-cell rotation (roll) |
| **Total** | **324** | **156** | **5,925** | **1,197** | |

Because each legal target admits three rotation angles, the total number of legal atomic moves is $156\times3=468$ for Level 2 and $1197\times3=3591$ for Level 3.

In Level 3, the breakdown by atomic moves is 243 / 81 / 27 for frame scales 1 / 3 / 9, and 36 / 108 / 216 / 648 / 2,232 for extension depths 1 / 1.5 / 2 / 2.5 / 3.

## 2.7 Reachable State Group

Let $G_n$ denote the group of all operations obtainable by applying finite sequences of legal atomic moves to the solved state at Level $n$. Throughout this document, "all reachable states" refers not to arbitrary labelings of positions and orientations, but specifically to the states in the orbit of the solved state under $G_n$.
