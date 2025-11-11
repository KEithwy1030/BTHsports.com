
    let matchesData = []
    if (response.data && response.data.code === 200 && response.data.data && response.data.data.matches) {
      // 转换后格式: {data: {code: 200, data: {matches: [...]}}}
      matchesData = response.data.data.matches;
    } else if (response.data && response.data.success === true && Array.isArray(response.data.data)) {
      // 原始JRKAN格式: {data: {success: true, data: [...]}}
      matchesData = response.data.data;
    }
    
    console.log('提取的比赛数据:', matchesData.length, '场')

