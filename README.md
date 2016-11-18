# lowCache
in memory cache use lowdb

## 实例化缓存
````
const CONFIG = {
    maxStack: 100, // int 最大占用内存,单位 MB
    maxTimes: 10, // int 最大调用次数,单位 次
    live: 600, // int 最长存活时间，单位 秒
    name: 'advisers', // string 仓库名字
};

const myDB = new LowCache(CONFIG);
````

## 方法

### 增加缓存 append
>参数 object   [object]: 缓存对象
>参数 object.key [string]: 缓存key
>参数 object.data [string]: 缓存数据

`myDB.append(object)`

无返回值，如果内存不足，则不缓存


### 使用缓存 use
>参数 token [string]: 用户token，用于判断登录状态：登录状态改变后，会重置全部的缓存
>参数 key   [string]: 缓存key

`const cache = myDB.use(token,key);`

返回值：
````
{
    key: 缓存key,
    data: 缓存数据,
    size: 数据大小,
    date: 数据缓存时间,超过CONFIG.live，本条缓存会被释放，
    times: 被使用次数，超过CONFIG.maxTimes，本条缓存会被释放,
}
````

### 查看缓存仓库信息 showInfo
`myDB.showInfo()`

返回值:
````
{
  "仓库名": ,
  "缓存条数": ,
  "内存占用量": kb,
  "剩余可用内存": kb,
}
````

### 查看缓存仓库数据 getAll
`myDB.getAll()`

返回值:
````
[
  {
    key: 缓存key,
    data: 缓存数据,
    size: 数据大小,
    date: 数据缓存时间,超过CONFIG.live，本条缓存会被释放，
    times: 被使用次数，超过CONFIG.maxTimes，本条缓存会被释放,
  },
  {...}
]
````






