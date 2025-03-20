const { MessageEmbed } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
require('dotenv').config();

// Check if Gemini API key is available
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Store user conversation history (in-memory, could be moved to a database for persistence)
const userChats = new Map();

module.exports = {
  name: 'chatdm',
  description: 'Start a private chat with the AI assistant in DMs',
  usage: 'chatdm <your message>',
  async execute(message, args) {
    // Check if API key is available
    if (!GEMINI_API_KEY) {
      const noKeyEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Configuration Error')
        .setDescription('Gemini API key is not configured. Please ask an admin to add it to the .env file.');
      return message.channel.send({ embeds: [noKeyEmbed] });
    }

    try {
      // Initialize the Gemini API
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      // Get user's chat history or create new chat
      if (!userChats.has(message.author.id)) {
        // Create a new chat session for this user
        const chat = model.startChat({
          history: [
            {
              role: "user",
              parts: [{ text: "You are a friendly assistant in a Discord DM conversation. Keep your responses concise but helpful. Respond in a natural, human-like way. Avoid being overly formal or robotic." }],
            },
            {
              role: "model",
              parts: [{ text: "Hi there! I'm ready to chat with you. What can I help you with today?" }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 500,
            temperature: 0.7,
            topP: 0.8,
            topK: 40,
          },
        });
        
        userChats.set(message.author.id, chat);
        
        // If no message provided in this first interaction, send a welcome message
        if (!args.length) {
          const welcomeEmbed = new MessageEmbed()
            .setColor('#0099FF')
            .setTitle('Private Chat Started')
            .setDescription("I've started a private chat with you! You can ask me anything, and I'll respond in a natural, conversational way. What's on your mind?")
            .setFooter({ text: 'Made by itsmeboi' });
            
          // Respond in DM to start the conversation
          await message.author.send({ embeds: [welcomeEmbed] });
          
          // Also respond in the channel that DM was sent
          const dmStartedEmbed = new MessageEmbed()
            .setColor('#00FF00')
            .setDescription('✅ I\'ve sent you a DM to start our conversation!');
          return message.channel.send({ embeds: [dmStartedEmbed] });
        }
      }
      
      // Get the user's chat session
      const chat = userChats.get(message.author.id);
      
      // Handle the message
      let userMessage;
      if (args.length) {
        userMessage = args.join(' ');
      } else {
        // If no message in subsequent interactions, ask for input
        const promptEmbed = new MessageEmbed()
          .setColor('#FFA500')
          .setDescription('What would you like to talk about? Please send a message after the command.');
        return message.author.send({ embeds: [promptEmbed] });
      }
      
      // Send typing indicator
      message.channel.sendTyping();
      
      // Let user know we're processing
      const processingEmbed = new MessageEmbed()
        .setColor('#FFA500')
        .setDescription('🤔 Thinking...');
      const processingMessage = await message.author.send({ embeds: [processingEmbed] });
      
      // Generate response
      const result = await chat.sendMessage(userMessage);
      const response = result.response.text();

      // Create the response embed
      const responseEmbed = new MessageEmbed()
        .setColor('#00FF00')
        .setDescription(response)
        .setFooter({ text: 'Made by itsmeboi' });
        
      // Edit the processing message with the AI's response
      await processingMessage.edit({ embeds: [responseEmbed] });
      
      // If this was initiated in a server channel, acknowledge receipt
      if (message.guild) {
        const confirmEmbed = new MessageEmbed()
          .setColor('#00FF00')
          .setDescription('✅ I\'ve responded to you in DMs!');
        message.channel.send({ embeds: [confirmEmbed] });
      }
      
    } catch (error) {
      console.error('Error in chatdm command:', error);
      
      // Handle API errors gracefully
      const errorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription(`There was an error processing your request: ${error.message}`);
      
      message.author.send({ embeds: [errorEmbed] }).catch(() => {
        // If DM fails, try to respond in the channel
        message.channel.send({ embeds: [
          new MessageEmbed()
            .setColor('#FF0000')
            .setDescription('❌ I couldn\'t send you a DM. Please ensure your DMs are open.')
        ]});
      });
    }
  }
};