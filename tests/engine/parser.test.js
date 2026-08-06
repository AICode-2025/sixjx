import { describe, it, expect } from 'vitest'
import { parse } from '../../../src/engine/ParserService.js'

describe('ParserService', () => {
  it('特：基础行 01 07 各10 → 2注，总额20', () => {
    const res = parse('01 07 各10')
    expect(res.items.length).toBe(1)
    const item = res.items[0]
    expect(item.play_type_id).toBe(1)
    expect(item.play_type_name).toBe('特')
    expect(item.numbers).toEqual([1, 7])
    expect(item.bet_count).toBe(2)
    expect(item.amount_per_bet).toBe(10)
    expect(item.total_amount).toBe(20)
    expect(item.odds).toBe(47)
  })

  it('二中二：3个号码 → C(3,2)=3 注，总额30', () => {
    const res = parse('02 04 06 二中二各10')
    expect(res.items.length).toBe(1)
    const item = res.items[0]
    expect(item.play_type_id).toBe(3)
    expect(item.numbers).toEqual([2, 4, 6])
    expect(item.bet_count).toBe(3)
    expect(item.total_amount).toBe(30)
    expect(item.details.length).toBe(3)
  })

  it('三中三：4个号码 → C(4,3)=4 注，总额20', () => {
    const res = parse('01 02 03 04 三中三各5')
    expect(res.items.length).toBe(1)
    const item = res.items[0]
    expect(item.play_type_id).toBe(4)
    expect(item.bet_count).toBe(4)
    expect(item.total_amount).toBe(20)
  })

  it('二连肖：鼠牛二连肖各10 → 1注', () => {
    const res = parse('鼠 牛 二连肖各10')
    expect(res.items.length).toBe(1)
    const item = res.items[0]
    expect(item.play_type_id).toBe(6)
    expect(item.zodiacs).toEqual(['鼠', '牛'])
    expect(item.bet_count).toBe(1)
    expect(item.total_amount).toBe(10)
  })

  it('无金额行：从下一行继承/合并金额', () => {
    const res = parse('01 02 07\n01 02 各10')
    expect(res.items.length).toBe(2)
    expect(res.total_amount).toBe(50) // 20 + 30
    expect(res.warnings.length).toBe(1)
  })

  it('等号多注格式 01=10 07=20', () => {
    const res = parse('01=10 07=20')
    expect(res.items.length).toBe(2)
    expect(res.total_amount).toBe(30)
  })

  it('错误对象不泄漏进 items（回归：原实现会混入并导致 total_amount 为 NaN）', () => {
    const res = parse('abc各10')
    expect(res.items.length).toBe(0)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(Number.isFinite(res.total_amount)).toBe(true)
  })

  it('易混淆字符 o/O/I/l/L 报错', () => {
    const res = parse('1O 07 各10')
    expect(res.items.length).toBe(0)
    expect(res.errors.some(e => e.message.includes('易混淆字符'))).toBe(true)
  })

  it('香港/澳门关键字冲突报错', () => {
    const res = parse('香港 澳门 各10')
    expect(res.errors.some(e => e.message.includes('冲突'))).toBe(true)
  })

  it('号码不足无法构成三中三', () => {
    const res = parse('01 02 三中三各10')
    expect(res.items.length).toBe(0)
    expect(res.errors.some(e => e.message.includes('不足'))).toBe(true)
  })

  it('平：01 02 各10 → 2注', () => {
    const res = parse('01 02 平各10')
    expect(res.items.length).toBe(1)
    expect(res.items[0].play_type_id).toBe(2)
    expect(res.items[0].total_amount).toBe(20)
  })

  describe('分类关键词（五行/波色/合数/生肖属性）', () => {
    it('五行：金各10 → 金 10 个号码', () => {
      const item = parse('金各10').items[0]
      expect(item.numbers).toEqual([4, 5, 12, 13, 26, 27, 34, 35, 42, 43])
      expect(item.bet_count).toBe(10)
    })

    it('五行：火各10 → 13 个号码（含39/40/41/48/49）', () => {
      const item = parse('火各10').items[0]
      expect(item.numbers).toEqual([2, 3, 10, 11, 18, 19, 32, 33, 39, 40, 41, 48, 49])
    })

    it('波色：红波各20 → 17 个号码', () => {
      const item = parse('红波各20').items[0]
      expect(item.numbers).toEqual([1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46])
      expect(item.total_amount).toBe(340)
    })

    it('合数单双：合数双各10 → 24 个号码', () => {
      const item = parse('合数双各10').items[0]
      expect(item.numbers.length).toBe(24)
    })

    it('生肖属性：家禽各50 → 牛马羊鸡狗猪 6 肖号码并集', () => {
      const item = parse('家禽各50').items[0]
      expect(item.numbers.length).toBeGreaterThan(0)
      expect(item.numbers.every(n => n >= 1 && n <= 49)).toBe(true)
    })

    it('三合/六合组合组：三合鼠龙猴各20 / 六合鼠牛各20', () => {
      const a = parse('三合鼠龙猴各20').items[0]
      const b = parse('六合鼠牛各20').items[0]
      expect(a.numbers.length).toBe(12)
      expect(b.numbers.length).toBe(8)
    })

    it('季风别名：东风各10 与春组一致，北/电与冬组一致', () => {
      const spring = parse('春各10').items[0].numbers
      const east = parse('东风各10').items[0].numbers
      expect(east).toEqual(spring)
      const north = parse('北各10').items[0].numbers
      const elec = parse('电各10').items[0].numbers
      expect(elec).toEqual(north)
      expect(north).toEqual([6, 7, 8, 18, 19, 20, 30, 31, 32, 42, 43, 44]) // 鼠猪牛
    })

    it('冬各10 可作分类词（修复：从金额标记别名移除「冬」）', () => {
      const item = parse('冬各10').items[0]
      expect(item.numbers).toEqual([6, 7, 8, 18, 19, 20, 30, 31, 32, 42, 43, 44]) // 鼠猪牛
    })

    it('双色并集：红蓝各50 = 红波各50 + 蓝波各50（33 码）', () => {
      const item = parse('红蓝各50').items[0]
      expect(item.numbers.length).toBe(33)
      expect(item.amount_per_bet).toBe(50)
      expect(item.total_amount).toBe(1650)
    })

    it('双色并集：绿单红双各20 = 绿单∪红双（18 码）', () => {
      const item = parse('绿单红双各20').items[0]
      expect(item.numbers.length).toBe(18)
      expect(item.total_amount).toBe(360)
    })

    it('双色并集：红波大各20 仍为交集（非波色组合不变）', () => {
      const item = parse('红波大各20').items[0]
      expect(item.numbers).toEqual([29, 30, 34, 35, 40, 45, 46]) // 红波∩大
    })

    it('单位+总N：31.41.49.27各10斤，总100 = 各10元（合计尾随忽略）', () => {
      const item = parse('31.41.49.27各10斤，总100').items[0]
      expect(item.numbers).toEqual([27, 31, 41, 49])
      expect(item.amount_per_bet).toBe(10)
      expect(item.total_amount).toBe(40)
    })

    it('单位+总N：13.49.15.27.39.29.18.30.07.31.22.34.46各2米总26 = 各2元，总26 不泄漏为号码', () => {
      const item = parse('13.49.15.27.39.29.18.30.07.31.22.34.46各2米总26').items[0]
      expect(item.numbers).not.toContain(26)
      expect(item.numbers.length).toBe(13)
      expect(item.amount_per_bet).toBe(2)
    })

    it('长词优先：金肖各10 不被五行「金」覆盖', () => {
      const item = parse('金肖各10').items[0]
      expect(item.numbers.length).toBe(8) // 猴鸡 2 肖
    })
  })

  describe('金额规则：小数自动更正为整数并提醒', () => {
    it('各12.5 → 更正为 13，并产生提醒', () => {
      const res = parse('01 02 各12.5')
      expect(res.errors.length).toBe(0)
      expect(res.items[0].amount_per_bet).toBe(13)
      expect(res.items[0].total_amount).toBe(26)
      expect(res.warnings.some(w => w.message.includes('12.5') && w.message.includes('13'))).toBe(true)
    })

    it('01号12.5 → 更正为 13', () => {
      const res = parse('01号12.5')
      expect(res.items[0].amount_per_bet).toBe(13)
      expect(res.items[0].total_amount).toBe(13)
      expect(res.warnings.length).toBe(1)
    })

    it('01=12.5 → 更正为 13', () => {
      const res = parse('01=12.5')
      expect(res.items[0].amount_per_bet).toBe(13)
      expect(res.warnings.length).toBe(1)
    })

    it('行尾小数金额 01 02 12.5 → 更正为 13', () => {
      const res = parse('01 02 12.5')
      expect(res.errors.length).toBe(0)
      expect(res.items[0].numbers).toEqual([1, 2])
      expect(res.items[0].amount_per_bet).toBe(13)
      expect(res.items[0].total_amount).toBe(26)
      expect(res.warnings.length).toBe(1)
    })

    it('平 03 04 各2.5 → 更正为 3', () => {
      const res = parse('平 03 04 各2.5')
      expect(res.items[0].play_type).toBe('平')
      expect(res.items[0].amount_per_bet).toBe(3)
      expect(res.warnings.length).toBe(1)
    })

    it('二连肖 各12.5 → 更正为 13', () => {
      const res = parse('二连肖 牛马 各12.5')
      expect(res.items[0].amount_per_bet).toBe(13)
      expect(res.warnings.length).toBe(1)
    })
  })

  describe('金额规则：总/共N 仅行尾生效', () => {
    it('行尾共50 无各N → 总额模式，01 02 每号 25', () => {
      const res = parse('01 02 共50')
      expect(res.errors.length).toBe(0)
      expect(res.items[0].numbers).toEqual([1, 2])
      expect(res.items[0].amount_per_bet).toBe(25)
      expect(res.items[0].total_amount).toBe(50)
    })

    it('行尾总50 有各N → 尾随合计忽略（01 02 各10 总50 = 各10元）', () => {
      const res = parse('01 02 各10 总50')
      expect(res.errors.length).toBe(0)
      expect(res.items[0].amount_per_bet).toBe(10)
      expect(res.items[0].total_amount).toBe(20)
    })

    it('中段总50 不泄漏为号码（01 总50 各10 → 号码仅1）', () => {
      const res = parse('01 总50 各10')
      expect(res.items[0].numbers).toEqual([1])
      expect(res.items[0].amount_per_bet).toBe(10)
      expect(res.items[0].total_amount).toBe(10)
    })

    it('行首总50 不泄漏（总50 01 各10 → 号码仅1）', () => {
      const res = parse('总50 01 各10')
      expect(res.items[0].numbers).toEqual([1])
      expect(res.items[0].amount_per_bet).toBe(10)
    })

    it('中段共5 不泄漏为号码（01 共5 02 各10 → 号码 1,2）', () => {
      const res = parse('01 共5 02 各10')
      expect(res.items[0].numbers).toEqual([1, 2])
      expect(res.items[0].amount_per_bet).toBe(10)
      expect(res.items[0].total_amount).toBe(20)
    })

    it('行尾共50元 保持每号金额 50', () => {
      const res = parse('01 02 共50元')
      expect(res.errors.length).toBe(0)
      expect(res.items[0].amount_per_bet).toBe(50)
      expect(res.items[0].total_amount).toBe(100)
    })
  })

  describe('回归：缺陷报告 R4（平=多注拆分/超界/总额/双色/中文数字/空值/连肖/继承）', () => {
    it('#1 平01=10 07=20 → 2个平（玩法前缀不丢失）', () => {
      const res = parse('平01=10 07=20')
      expect(res.items.length).toBe(2)
      expect(res.items.every(i => i.play_type === '平')).toBe(true)
      expect(res.items[0].amount_per_bet).toBe(10)
      expect(res.items[1].amount_per_bet).toBe(20)
      expect(res.items[0].odds).toBe(7)
    })

    it('#1 01 02 07=10 08=20 → 前置号码保留（3注+1注）', () => {
      const res = parse('01 02 07=10 08=20')
      expect(res.items.length).toBe(2)
      expect(res.items[0].numbers).toEqual([1, 2, 7])
      expect(res.items[0].amount_per_bet).toBe(10)
      expect(res.items[0].total_amount).toBe(30)
      expect(res.items[1].numbers).toEqual([8])
      expect(res.items[1].amount_per_bet).toBe(20)
    })

    it('#1 二中二01=10 02=10 03=20 → 报号码不足，不静默变特', () => {
      const res = parse('二中二01=10 02=10 03=20')
      expect(res.items.length).toBe(0)
      expect(res.errors.some(e => e.message.includes('不足'))).toBe(true)
    })

    it('#2 01 50 各10 → 超界号码明确报错，不静默删号', () => {
      const res = parse('01 50 各10')
      expect(res.items.length).toBe(0)
      expect(res.errors.some(e => e.message.includes('号码必须在01-49之间') && e.message.includes('50'))).toBe(true)
    })

    it('#2 37-300各10 → 范围展开后超界明确报错', () => {
      const res = parse('37-300各10')
      expect(res.items.length).toBe(0)
      expect(res.errors.some(e => e.message.includes('号码必须在01-49之间'))).toBe(true)
    })

    it('#3 鼠蛇总100 → 非整除明确报错，总额不漂移', () => {
      const res = parse('鼠蛇总100')
      expect(res.items.length).toBe(0)
      expect(res.errors.some(e => e.message.includes('无法平均分摊'))).toBe(true)
    })

    it('#3 二中二 总100 → 非整除明确报错（100/21=4.76）', () => {
      const res = parse('01 02 03 04 05 06 07 二中二 总100')
      expect(res.items.length).toBe(0)
      expect(res.errors.some(e => e.message.includes('无法平均分摊'))).toBe(true)
    })

    it('#4 红蓝二中二各50 → 拆成红/蓝两笔（256注12800元）', () => {
      const res = parse('红蓝二中二各50')
      expect(res.items.length).toBe(2)
      const totalCount = res.items.reduce((s, i) => s + i.bet_count, 0)
      const totalAmount = res.items.reduce((s, i) => s + i.total_amount, 0)
      expect(totalCount).toBe(256)
      expect(totalAmount).toBe(12800)
    })

    it('#6 三十号10 → 号码30，金额10', () => {
      const item = parse('三十号10').items[0]
      expect(item.numbers).toEqual([30])
      expect(item.amount_per_bet).toBe(10)
    })

    it('#6 十二号10 → 号码12', () => {
      const item = parse('十二号10').items[0]
      expect(item.numbers).toEqual([12])
      expect(item.amount_per_bet).toBe(10)
    })

    it('#9 parse(null/undefined) 不抛异常', () => {
      expect(() => parse(null)).not.toThrow()
      expect(() => parse(undefined)).not.toThrow()
      const res = parse(null)
      expect(Array.isArray(res.items)).toBe(true)
      expect(res.errors).toEqual([])
    })

    it('#11 二连肖 numbers 置空、zodiacs 保留生肖名', () => {
      const item = parse('二连肖 牛马 各10').items[0]
      expect(item.numbers).toEqual([])
      expect(item.zodiacs).toEqual(['牛', '马'])
      expect(item.zodiac_indices.length).toBe(2)
    })

    it('#12 无金额行向前回溯：01 02 各10\\n01 02 07 → 第2行继承第1行', () => {
      const res = parse('01 02 各10\n01 02 07')
      expect(res.items.length).toBe(2)
      expect(res.total_amount).toBe(50) // 20 + 30
      expect(res.warnings.some(w => w.message.includes('继承'))).toBe(true)
    })

    it('#12 坏行夹中间可跳过：01 02 07\\nabc\\n01 02 各10 → 第1行继承第3行', () => {
      const res = parse('01 02 07\nabc\n01 02 各10')
      expect(res.items.length).toBe(2)
      expect(res.total_amount).toBe(50) // 30 + 20
      expect(res.warnings.some(w => w.message.includes('继承'))).toBe(true)
    })

    it('#10 客户端本地系数注入：parse(text, lotteryId, oddsMap) 优先用本地设置，未设置回退默认', () => {
      const res = parse('01 02 各10', 1, { 1: 50, 2: 8.5 })
      expect(res.items[0].odds).toBe(50) // 特用本地 50
      const ping = parse('01 02 平各10', 1, { 1: 50, 2: 8.5 }).items[0]
      expect(ping.odds).toBe(8.5) // 平用本地 8.5
      const fallback = parse('01 02 03 三中三各10', 1, { 1: 50 }).items[0]
      expect(fallback.odds).toBe(700) // 未设置 → 默认
    })

    it('#10 连肖同样注入本地系数', () => {
      const item = parse('二连肖 牛马 各10', 1, { 6: 6.6 }).items[0]
      expect(item.odds).toBe(6.6)
    })

    it('担忧点1 业务确认：1-5各10 为范围语义 → 5 注', () => {
      const item = parse('1-5各10').items[0]
      expect(item.numbers).toEqual([1, 2, 3, 4, 5])
      expect(item.bet_count).toBe(5)
      expect(item.total_amount).toBe(50)
    })

    it('#8 业务确认：不支持「号码+总N+玩法词」词序 → 明确报错', () => {
      const res = parse('01 02 03 04 05 06 07 总100 二中二')
      expect(res.items.length).toBe(0)
      expect(res.errors.length).toBeGreaterThan(0)
      expect(res.total_amount).toBe(0)
    })

    it('担忧点2 业务确认：3个号各10 组合词歧义 → 直接报错，不静默解析', () => {
      const res = parse('3个号各10')
      expect(res.items.length).toBe(0)
      expect(res.errors.some(e => e.message.includes('金额标记组合存在歧义'))).toBe(true)
    })

    it('担忧点2 合法标记不受影响：每注10 / 各注10 → 正常解析', () => {
      const item = parse('01 每注10').items[0]
      expect(item.numbers).toEqual([1])
      expect(item.amount_per_bet).toBe(10)
      const item2 = parse('01 各注10').items[0]
      expect(item2.amount_per_bet).toBe(10)
    })

    it('担忧点3 业务确认：并列对立属性报互斥（家禽野兽/前肖后肖/单笔双笔）', () => {
      for (const text of ['家禽野兽各10', '前肖后肖各10', '单笔双笔各10']) {
        const res = parse(text)
        expect(res.items.length).toBe(0)
        expect(res.errors.some(e => e.message.includes('互斥分组'))).toBe(true)
      }
    })

    it('担忧点3 单一属性词不受影响：家禽各10 / 前肖各10 正常解析', () => {
      const a = parse('家禽各10').items[0]
      expect(a.numbers.length).toBeGreaterThan(0)
      const b = parse('前肖各10').items[0]
      expect(b.numbers.length).toBeGreaterThan(0)
    })
  })
})