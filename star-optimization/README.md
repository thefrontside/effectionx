# ⭐ optimize



On rare occasions, `yield*`` syntax can cause a performance degradation, for example when there are many, many levels of recursion.

The idea is that we can roll up any number of levels of recursion into a single yield point by transforming:
```js
yield* operation;
```
into:

```js
yield star(operation);
```

