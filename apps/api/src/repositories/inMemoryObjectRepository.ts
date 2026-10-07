import type { ObjectType } from '@bfp/domain';
import type { ObjectRepository, PersistedObject } from './types';

/** In-memory implementation of the objects repository. */
export class InMemoryObjectRepository implements ObjectRepository {
  private readonly objects = new Map<string, PersistedObject<unknown>>();

  constructor(initialObjects: ReadonlyArray<PersistedObject<unknown>> = []) {
    for (const object of initialObjects) {
      this.objects.set(this.createKey(object.userId, object.type, object.id), object);
    }
  }

  async get<TValue>(userId: string, type: ObjectType, id: string) {
    const item = this.objects.get(this.createKey(userId, type, id));
    return item as PersistedObject<TValue> | undefined;
  }

  async put<TValue>(object: PersistedObject<TValue>) {
    this.objects.set(this.createKey(object.userId, object.type, object.id), object);
  }

  async delete(userId: string, type: ObjectType, id: string) {
    this.objects.delete(this.createKey(userId, type, id));
  }

  async listByType<TValue>(userId: string, type: ObjectType) {
    return [...this.objects.values()].filter(
      (item) => item.userId === userId && item.type === type,
    ) as Array<PersistedObject<TValue>>;
  }

  async findById<TValue>(id: string) {
    return [...this.objects.values()].filter((item) => item.id === id) as Array<
      PersistedObject<TValue>
    >;
  }

  async listShared<TValue>(type: ObjectType) {
    return [...this.objects.values()].filter(
      (item) => item.type === type && item.shared === true,
    ) as Array<PersistedObject<TValue>>;
  }

  private createKey(userId: string, type: ObjectType, id: string) {
    return `${userId}#${type}#${id}`;
  }
}
