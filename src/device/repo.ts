import { defaultSettings } from '@shared/defaults';
import type { Block, Commitment, Course, Exam, Settings, Topic } from '@shared/types';
import { ApiError } from '../lib/errors';
import { uid } from './id';
import type { DocumentStore } from './storage';

interface Doc {
  v: 1;
  settings: Partial<Settings>;
  courses: Course[];
  exams: Exam[];
  topics: Topic[];
  commitments: Commitment[];
  blocks: Block[];
}

const empty = (): Doc => ({ v: 1, settings: {}, courses: [], exams: [], topics: [], commitments: [], blocks: [] });

/** In-memory data model with write-through persistence. Mirrors the server's Repo so the planner service is shared. */
export class DeviceRepo {
  private doc: Doc = empty();
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: DocumentStore,
    private readonly fallbackTz: string,
  ) {}

  async load(): Promise<void> {
    const raw = await this.store.read();
    if (!raw) return;
    try {
      this.doc = this.parse(raw);
    } catch {
      // keep the unreadable document out of the way instead of crashing on every launch
      this.doc = empty();
    }
  }

  private parse(raw: string): Doc {
    const d = JSON.parse(raw) as Partial<Doc>;
    if (!d || d.v !== 1) throw new Error('Unsupported backup format');
    return { ...empty(), ...d, v: 1 };
  }

  /** Serialized, ordered writes; resolves when the latest state is stored. */
  flush(): Promise<void> {
    const snapshot = JSON.stringify(this.doc);
    this.writing = this.writing.then(() => this.store.write(snapshot)).catch(() => undefined);
    return this.writing;
  }

  export(): string {
    return JSON.stringify(this.doc);
  }

  async restore(raw: string): Promise<void> {
    this.doc = this.parse(raw);
    await this.flush();
  }

  /** Runs several changes, then stores once. */
  tx<T>(fn: () => T): T {
    const out = fn();
    void this.flush();
    return out;
  }

  // settings
  getSettings(): Settings {
    return { ...defaultSettings(this.fallbackTz), ...this.doc.settings } as Settings;
  }
  saveSettings(patch: Partial<Settings>): Settings {
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (this.doc.settings as Record<string, unknown>)[k] = v;
    void this.flush();
    return this.getSettings();
  }

  // courses
  listCourses(): Course[] {
    return [...this.doc.courses].sort((a, b) => a.code.localeCompare(b.code));
  }
  getCourse(id: string): Course | undefined {
    return this.doc.courses.find((c) => c.id === id);
  }
  createCourse(c: Omit<Course, 'id'>, id: string = uid()): Course {
    if (this.doc.courses.some((x) => x.code === c.code)) throw new ApiError(409, 'That course already exists.');
    const course = { id, ...c };
    this.doc.courses.push(course);
    void this.flush();
    return course;
  }
  updateCourse(id: string, patch: Partial<Omit<Course, 'id'>>): Course | undefined {
    const cur = this.getCourse(id);
    if (!cur) return undefined;
    if (patch.code && this.doc.courses.some((x) => x.id !== id && x.code === patch.code)) throw new ApiError(409, 'That course already exists.');
    Object.assign(cur, patch);
    void this.flush();
    return cur;
  }
  deleteCourse(id: string): boolean {
    const before = this.doc.courses.length;
    this.doc.courses = this.doc.courses.filter((c) => c.id !== id);
    if (this.doc.courses.length === before) return false;
    const examIds = new Set(this.doc.exams.filter((e) => e.courseId === id).map((e) => e.id));
    this.doc.exams = this.doc.exams.filter((e) => e.courseId !== id);
    this.doc.topics = this.doc.topics.filter((t) => t.courseId !== id);
    this.doc.blocks = this.doc.blocks
      .filter((b) => !(b.status !== 'done' && (b.courseId === id || (b.examId && examIds.has(b.examId)))))
      .map((b) => (b.courseId === id ? { ...b, courseId: null, examId: null, topicId: null } : b));
    void this.flush();
    return true;
  }

  // exams
  listExams(): Exam[] {
    return [...this.doc.exams].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  }
  getExam(id: string): Exam | undefined {
    return this.doc.exams.find((e) => e.id === id);
  }
  createExam(e: Omit<Exam, 'id'>, id: string = uid()): Exam {
    const exam = { id, ...e };
    this.doc.exams.push(exam);
    void this.flush();
    return exam;
  }
  updateExam(id: string, patch: Partial<Omit<Exam, 'id'>>): Exam | undefined {
    const cur = this.getExam(id);
    if (!cur) return undefined;
    Object.assign(cur, patch);
    void this.flush();
    return cur;
  }
  deleteExam(id: string): boolean {
    const before = this.doc.exams.length;
    this.doc.exams = this.doc.exams.filter((e) => e.id !== id);
    if (this.doc.exams.length === before) return false;
    this.doc.blocks = this.doc.blocks
      .filter((b) => !(b.examId === id && b.status !== 'done'))
      .map((b) => (b.examId === id ? { ...b, examId: null } : b));
    void this.flush();
    return true;
  }

  // topics
  listTopics(): Topic[] {
    return [...this.doc.topics];
  }
  createTopic(t: Omit<Topic, 'id'>, id: string = uid()): Topic {
    const topic = { id, ...t };
    this.doc.topics.push(topic);
    void this.flush();
    return topic;
  }
  updateTopic(id: string, title: string): boolean {
    const t = this.doc.topics.find((x) => x.id === id);
    if (!t) return false;
    t.title = title;
    void this.flush();
    return true;
  }
  deleteTopic(id: string): boolean {
    const before = this.doc.topics.length;
    this.doc.topics = this.doc.topics.filter((t) => t.id !== id);
    if (this.doc.topics.length === before) return false;
    this.doc.blocks = this.doc.blocks.map((b) => (b.topicId === id ? { ...b, topicId: null } : b));
    void this.flush();
    return true;
  }

  // commitments
  listCommitments(): Commitment[] {
    return [...this.doc.commitments].sort((a, b) => a.start.localeCompare(b.start));
  }
  createCommitment(c: Omit<Commitment, 'id'>, id: string = uid()): Commitment {
    const item = { id, ...c };
    this.doc.commitments.push(item);
    void this.flush();
    return item;
  }
  updateCommitment(id: string, patch: Partial<Omit<Commitment, 'id'>>): Commitment | undefined {
    const cur = this.doc.commitments.find((c) => c.id === id);
    if (!cur) return undefined;
    Object.assign(cur, patch);
    void this.flush();
    return cur;
  }
  deleteCommitment(id: string): boolean {
    const before = this.doc.commitments.length;
    this.doc.commitments = this.doc.commitments.filter((c) => c.id !== id);
    void this.flush();
    return this.doc.commitments.length !== before;
  }

  // blocks
  blocksOn(date: string): Block[] {
    return this.doc.blocks.filter((b) => b.date === date).sort((a, b) => a.start - b.start || a.end - b.end);
  }
  studyHistory(): Block[] {
    return this.doc.blocks.filter((b) => b.kind === 'study' || b.kind === 'review').sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  }
  getBlock(id: string): Block | undefined {
    return this.doc.blocks.find((b) => b.id === id);
  }
  replaceDay(date: string, blocks: Block[]): void {
    this.doc.blocks = [...this.doc.blocks.filter((b) => b.date !== date), ...blocks];
    void this.flush();
  }
  setBlockStatus(id: string, status: Block['status'], doneAt: string | null): void {
    const b = this.getBlock(id);
    if (!b) return;
    b.status = status;
    b.doneAt = doneAt;
    void this.flush();
  }
  markPastMissed(today: string): number {
    let n = 0;
    for (const b of this.doc.blocks) {
      if (b.date < today && b.status === 'planned' && (b.kind === 'study' || b.kind === 'review')) {
        b.status = 'missed';
        n += 1;
      }
    }
    if (n > 0) void this.flush();
    return n;
  }

  /** Remove everything the demo or a restore replaces. */
  clearAll(): void {
    this.doc = { ...empty(), settings: this.doc.settings };
    void this.flush();
  }
  isEmpty(): boolean {
    const d = this.doc;
    return d.exams.length === 0 && d.courses.length === 0 && d.commitments.length === 0 && !d.blocks.some((b) => b.kind === 'study' || b.kind === 'review');
  }
}
