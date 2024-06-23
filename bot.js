require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron");

const supabaseUrl = "https://ilrpqgyivrmccpeoxhxr.supabase.co";
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

async function getNewestQuery() {
  try {
    const { data, error } = await supabase
      .from("donations")
      .select("media_uid")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Supabase error:", error.message);
      return null;
    }

    if (data && data.length > 0) {
      return data[0].media_uid;
    }

    return null;
  } catch (error) {
    console.error("Error fetching data from Supabase:", error.message);
    return null;
  }
}

let lastSentMediaUid;

async function sendNewestDonation(channelId) {
  try {
    const newestQuery = await getNewestQuery();
    if (newestQuery && newestQuery !== lastSentMediaUid) {
      const channelInfo = await bot.telegram.getChat(channelId);

      if (channelInfo.photo.big_file_id) {
        const photoLink = await bot.telegram.getFileLink(
          channelInfo.photo.big_file_id
        );
        const photoUrl = photoLink.href;

        res = await axios.get(photoUrl, {
          responseType: "arraybuffer"
        });

        await bot.telegram.sendPhoto(
          channelId,
          { source: Buffer.from(res.data) },
          {
            caption: `⭐️ _\\DONASI DARI MEMBER MAU DI RATE DI KOMENTAR 1 \\-\\ 100_\\\n\n🔗 [Tap Here](https://t.me/rategionbot?start=${newestQuery})\n\n👥 _\\BOT DONASI_\\\n @sharegionbot`,
            parse_mode: "MarkdownV2"
          }
        );
        lastSentMediaUid = newestQuery;
        console.log("Newest donation has been sent.");
      } else {
        console.log("Channel profile photo not found.");
      }
    } else {
      console.log(
        "There is no new donation to send or it has been sent previously."
      );
    }
  } catch (error) {
    console.error("Error sending newest donation to Telegram:", error.message);
  }
}

cron.schedule("*/5 * * * *", async () => {
  const channelId = -1002177187950;
  console.log("Running cronjob to send newest donation");
  await sendNewestDonation(channelId);
});

async function checkMembership(ctx, channelId) {
  try {
    const channelMember = await ctx.telegram.getChatMember(
      channelId,
      ctx.from.id
    );

    if (channelMember.status === "left") {
      const channelJoinLink =
        await ctx.telegram.exportChatInviteLink(channelId);
      return { member: false, joinLink: { channelJoinLink } };
    }

    return { member: true };
  } catch (error) {
    console.error("Error checking user membership:", error);
    return { member: false };
  }
}

bot.start(async ctx => {
  const channelID = -1002177187950;

  const { member, joinLink } = await checkMembership(ctx, channelID, null);

  if (!member) {
    let message =
      "🚫 _Anda harus menjadi anggota channel untuk menggunakan perintah ini._";
    let replyMarkup = {
      inline_keyboard: []
    };

    if (joinLink.channelJoinLink) {
      message += "\n\n↘️ _Silakan bergabung ke channel:_";
      replyMarkup.inline_keyboard.push([
        { text: "📢 Join Channel", url: joinLink.channelJoinLink }
      ]);
    }

    // Reply with the message and button
    ctx.telegram.sendMessage(ctx.chat.id, message, {
      reply_markup: replyMarkup,
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });
    return;
  }

  // User is a member, reply with waiting message
  const waitingMessage = await ctx.reply("⏱️ _Please waiting…_", {
    parse_mode: "Markdown"
  });

  const query = ctx.message.text.split(" ")[1];
  if (query) {
    const { data, error } = await supabase
      .from("donations")
      .select("*")
      .eq("media_uid", query)
      .single();

    if (error) {
      console.error("Error fetching data from Supabase:", error.message);
      ctx.reply("🚫 _Terjadi kesalahan saat mencari data._", {
        parse_mode: "Markdown"
      });
    } else if (data) {
      try {
        let response;
        let mediaType = data.media_type;

        if (
          mediaType === "photo" ||
          mediaType === "video" ||
          mediaType === "audio"
        ) {
          response = await axios.get(data.media_link, {
            responseType: "arraybuffer"
          });
        } else {
          throw new Error("Unsupported media type");
        }

        if (mediaType === "photo") {
          await ctx.replyWithPhoto(
            { source: Buffer.from(response.data) },
            { caption: data.media_caption }
          );
        } else if (mediaType === "video") {
          await ctx.replyWithVideo(
            { source: Buffer.from(response.data) },
            { caption: data.media_caption }
          );
        } else if (mediaType === "audio") {
          await ctx.replyWithAudio(
            { source: Buffer.from(response.data) },
            { caption: data.media_caption }
          );
        }
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          waitingMessage.message_id
        );
      } catch (error) {
        console.error("Error fetching or sending media:", error);
        ctx.reply("🚫 _Gagal mengirim media. Silakan coba lagi nanti._", {
          parse_mode: "Markdown"
        });
      }
    } else {
      ctx.reply(
        "🚫 _Tidak ada data yang ditemukan. Silakan coba lagi nanti._",
        {
          parse_mode: "Markdown"
        }
      );
    }
  } else {
    ctx.reply("🚫 _Tidak ada data yang ditemukan. Silakan coba lagi nanti._", {
      parse_mode: "Markdown"
    });
  }
});

bot.launch();
