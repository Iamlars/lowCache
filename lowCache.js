// 内存缓存器

const low = require('lowdb');
const _ = require('lodash');
const logs = {
  zh: {
    repositoryName: '仓库名',
    totalStores: '缓存条数',
    totalMemory: '内存占用量',
    spareMemory: '剩余可用内存',
    lessMemory: '可用内存不足',
    notFound: '记录不存在',
    cleard: '缓存数据已经被清空',
    changed: '用户状态发生了改变',
    times: function(times,key){
      return `第 ${times} 次调用 ${key} 接口`
    },
    tooOld: function(diff,live){
      return `过老的数据: 当前超时${diff}秒, 允许最大超时: ${live}秒`
    },
    tooMore: function(times,maxTimes){
      return `超过最大使用次数: 当前使用次数${times}, 允许最大使用次数: ${maxTimes}`
    },
    appended: function(data){
      return `缓存 ${data.key} 成功,占用内存 ${(data.size/1024).toFixed(2)}kb 。`
    },
  },
  en: {
    repositoryName: 'repositoryName',
    totalStores: 'totalStores',
    totalMemory: 'totalMemory',
    spareMemory: 'spareMemory',
    lessMemory: 'lessMemory',
    notFound: 'record not found',
    cleard: 'all stores are cleared out',
    changed: 'user state changed',
    times: function(times,key){
      return `use ${key} x ${times}`
    },
    tooOld: function(diff,live){
      return `Over the old data: the current timeout ${diff} seconds, allowing the maximum timeout: ${live} seconds`
    },
    tooMore: function(times,maxTimes){
      return `More than the maximum number of use: now used ${times} times, all max use times: ${maxTimes}`
    },
    appended: function(data){
      return `success cache ${data.key}, use ${(data.size/1024).toFixed(2)}kb memory。`
    },
  }
}


class LowCache {

  constructor(settings) {
    this.db = low();
    this.storeName = settings.name;
    this.db.defaults({ [settings.name]: [] }).value();

    this.maxStack = settings.maxStack * 1024 * 1024;
    this.maxTimes = settings.maxTimes;
    this.local = logs[settings.local || 'zh'];
    this.live = settings.live;
    this.noop = function (){};
    this.log = process.env.NODE_ENV === 'production' ? this.noop : console.log;
    this.ECMA_SIZES = {
      STRING: 2,
      BOOLEAN: 4,
      NUMBER: 8
    };

    this.userState;

  }

  // 获取当前仓库对象 get current repository object
  getTable() {
    return this.db.get(this.storeName)
  }

  // 获取当前仓库数据  get current repository data
  getAll() {
    return this.getTable().value();
  }

  // 获取当前仓库信息  get current repository info
  showInfo() {
    const stack = this.getTotalStack();
    this.log({
      [this.local['repositoryName']]: this.storeName,
      [this.local['totalStores']]: this.getCount(),
      [this.local['totalMemory']]: (stack/1024).toFixed(2)+'kb',
      [this.local['spareMemory']]: ((this.maxStack - stack)/1024).toFixed(2)+'kb',
    })
  }

  // 存放  append new data into current repository
  append(obj) {

    // 包装数据对象
    let data = _.cloneDeep(obj);
    data.size = this.sizeof(data);
    data.date = new Date().getTime();
    data.times = 1;

    // 计算内存是否足够，如果已满，则不进入
    if((this.maxStack <= this.getTotalStack()+data.size)){
      return this.log(this.local.lessMemory)
    }
    this.getTable().push(data).value();
    this.log( this.local.appended(data) );
    return this.showInfo();
  }

  // 调取   use data from current repository by key and token
  use(token,key) {

    // 如果用户状态发生了改变，则重置缓存
    if(this.isUserChange(token)){
      return this.clear();
    }

    // 超时或调用次数超限，则不返回值, 并且删除该记录
    if(!this.isfresh(key)){
      this.remove(key);
      return;
    }

    // 更新调用次数字段
    let times = this.getUsedTimes(key);
    times++;
    this.getTable().chain().find({key: key}).assign({times: times}).value();
    this.log(this.local.times(times,key));
    return this._getData(key);
  }

  // 删除   remove a store from current repository by key
  remove(key) {
    return this.getTable().remove({key: key}).value();
  }

  // 清空 当用户登录-登出时，清空全部缓存 clear current repository
  clear(key) {
    this.getTable().remove().value();
    this.log(this.local.cleard)
    this.showInfo()
  }

  // 计算总数 get total stores 
  getCount() {
    return this.getTable().value().length;
  }

  // 计算总内存 get total memories
  getTotalStack() {
    return this.getTable().value().reduce((total,item)=>{
      return total += item.size;
    },0)
  }

  // 获取值，内部方法用 get a store, private method
  _getData(key) {
    return this.getTable().find({key: key}).value();
  }

  // 获取调用次数 get used times in a store 
  getUsedTimes(key) {
    const obj = this._getData(key);
    if(!obj){
      this.log(this.local.notFound);
      return 0;
    }
    return obj.times;
  }

  // 获取时间差 get lived time 
  getTimeago(key) {
    const obj = this._getData(key);
    if(!obj){
      this.log(this.local.notFound);
      return 0;
    }
    return (new Date().getTime() - obj.date)/1000;
  }

  // 检查数据新鲜度 check this store isfresh
  isfresh(key) {
    const times = this.getUsedTimes(key);
    if(!times) return;
    if(times && (times >= this.maxTimes) ){
      return this.log(this.local.tooMore(times,this.maxTimes));
    }

    const diff = this.getTimeago(key);
    if(!diff) return;
    if(diff && (diff >= this.live) ){
      return this.log(this.local.tooMore(diff,this.live));
    }

    return true
  }

  // 检查用户状态是否发生改变：登入，登出  check user state
  isUserChange(token) {

    // 如果上次token和本次不一致，则发生了改变
    if(this.userState != token){ // @2
      this.userState = token;
      this.log(this.local.changed);
      return true;
    }

    // @3
    return false;

    // 流程2: 未登录状态访问--->@3--->登录--->@2--->还是登录--->@3--->登出或token过期--->@2--->未登录状态访问

  }

  // 获取对象占用内存大小 get object size
  sizeof(object) {

    // 代码拷贝自npm包：https://www.npmjs.org/package/object-sizeof
    if (object !== null && typeof (object) === 'object') {
      if (Buffer.isBuffer(object)) {
        return object.length;
      }
      else {
        var bytes = 0;
        for (var key in object) {

          if(!Object.hasOwnProperty.call(object, key)) {
            continue;
          }

          bytes += this.sizeof(key);
          try {
            bytes += this.sizeof(object[key]);
          } catch (ex) {
            if(ex instanceof RangeError) {
              // circular reference detected, final result might be incorrect
              // let's be nice and not throw an exception
              bytes = 0;
            }
          }
        }
        return bytes;
      }
    } else if (typeof (object) === 'string') {
      return object.length * this.ECMA_SIZES.STRING;
    } else if (typeof (object) === 'boolean') {
      return this.ECMA_SIZES.BOOLEAN;
    } else if (typeof (object) === 'number') {
      return this.ECMA_SIZES.NUMBER;
    } else {
      return 0;
    }
  }

}

module.exports = LowCache;
