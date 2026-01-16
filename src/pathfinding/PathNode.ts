import type { GridPosition } from '../types/index.js';

/**
 * Node in the pathfinding search
 */
export interface PathNode {
  position: GridPosition;
  /** Cost from start to this node */
  gCost: number;
  /** Heuristic cost from this node to goal */
  hCost: number;
  /** Total cost (gCost + hCost) */
  fCost: number;
  /** Parent node for path reconstruction */
  parent: PathNode | null;
}

/**
 * Create a new path node
 */
export function createPathNode(
  position: GridPosition,
  gCost: number,
  hCost: number,
  parent: PathNode | null = null
): PathNode {
  return {
    position,
    gCost,
    hCost,
    fCost: gCost + hCost,
    parent,
  };
}

/**
 * Create a key for a grid position (for maps)
 */
export function positionKey(pos: GridPosition): string {
  return `${pos.col},${pos.row}`;
}

/**
 * Priority queue (min-heap) for A* open set
 */
export class PriorityQueue {
  private heap: PathNode[] = [];

  get length(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  enqueue(node: PathNode): void {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): PathNode | null {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop()!;

    const min = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    return min;
  }

  /**
   * Update a node's priority (re-sort)
   */
  updatePriority(node: PathNode): void {
    const index = this.heap.indexOf(node);
    if (index !== -1) {
      this.bubbleUp(index);
      this.bubbleDown(index);
    }
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].fCost >= this.heap[parentIndex].fCost) break;
      [this.heap[index], this.heap[parentIndex]] = [
        this.heap[parentIndex],
        this.heap[index],
      ];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const leftIndex = 2 * index + 1;
      const rightIndex = 2 * index + 2;
      let smallest = index;

      if (
        leftIndex < length &&
        this.heap[leftIndex].fCost < this.heap[smallest].fCost
      ) {
        smallest = leftIndex;
      }

      if (
        rightIndex < length &&
        this.heap[rightIndex].fCost < this.heap[smallest].fCost
      ) {
        smallest = rightIndex;
      }

      if (smallest === index) break;

      [this.heap[index], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[index],
      ];
      index = smallest;
    }
  }
}
